import { getOptionalEnv } from "@/lib/env";
import type {
  AssignUserRoleArgs,
  NativePermission,
  NativeRole,
  PermissionProvider,
  ProfileSyncArgs,
} from "./types";
import {
  ProviderNotConfiguredError,
  ProviderUnsupportedError,
} from "./types";

/**
 * Outline (knowledge base) provider.
 *
 * Outline roles: admin | member | viewer | guest | suspended.
 * W katalogu używamy:
 *   knowledge_admin  → admin
 *   knowledge_user   → member
 *   knowledge_viewer → viewer
 *
 * Mapowanie realm roles → Outline happens on role change i przy SSO
 * bridge. Outline nie wspiera custom roles — tylko fixed set.
 *
 * API docs: https://www.getoutline.com/developers
 *   /api/users.list
 *   /api/users.info
 *   /api/users.update_role   { id, role }   role ∈ {admin, member, viewer}
 *   /api/users.delete
 */

interface Config {
  baseUrl: string;
  apiToken: string;
}

function getConfig(): Config {
  const baseUrl = getOptionalEnv("OUTLINE_URL").replace(/\/$/, "");
  const apiToken = getOptionalEnv("OUTLINE_API_TOKEN");
  if (!baseUrl || !apiToken) {
    throw new ProviderNotConfiguredError("outline");
  }
  return { baseUrl, apiToken };
}

async function outlineFetch<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const cfg = getConfig();
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Outline ${path}: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { ok?: boolean; data?: T };
  if (json.ok === false) {
    throw new Error(`Outline ${path}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return (json.data ?? (json as unknown as T)) as T;
}

interface OutlineUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | "viewer" | "guest";
  isSuspended?: boolean;
}

const OUTLINE_ROLES: NativeRole[] = [
  {
    id: "viewer",
    name: "Viewer",
    description: "Tylko do odczytu — nie może tworzyć ani edytować dokumentów.",
    permissions: ["document.read", "collection.read"],
    systemDefined: true,
  },
  {
    id: "member",
    name: "Member",
    description:
      "Standardowy użytkownik — czyta, tworzy i edytuje dokumenty.",
    permissions: [
      "document.read",
      "document.create",
      "document.update",
      "collection.read",
      "collection.create",
    ],
    systemDefined: true,
  },
  {
    id: "admin",
    name: "Admin",
    description:
      "Administrator — zarządzanie użytkownikami, kolekcjami, integracjami.",
    permissions: ["*"],
    systemDefined: true,
  },
];

const OUTLINE_PERMISSIONS: NativePermission[] = [
  { key: "document.read", label: "Czytanie dokumentów", group: "Dokumenty" },
  { key: "document.create", label: "Tworzenie dokumentów", group: "Dokumenty" },
  { key: "document.update", label: "Edycja dokumentów", group: "Dokumenty" },
  { key: "collection.read", label: "Czytanie kolekcji", group: "Kolekcje" },
  { key: "collection.create", label: "Tworzenie kolekcji", group: "Kolekcje" },
  { key: "user.manage", label: "Zarządzanie użytkownikami", group: "Admin" },
  { key: "integration.manage", label: "Integracje", group: "Admin" },
];

export class OutlineProvider implements PermissionProvider {
  readonly id = "outline";
  readonly label = "Outline (Baza wiedzy)";

  isConfigured(): boolean {
    try {
      getConfig();
      return true;
    } catch {
      return false;
    }
  }

  supportsCustomRoles(): boolean {
    return false;
  }

  async listPermissions(): Promise<NativePermission[]> {
    return OUTLINE_PERMISSIONS;
  }

  async listRoles(): Promise<NativeRole[]> {
    if (!this.isConfigured()) return [];
    try {
      // Count users per role — useful UI metric.
      const users = await this.listUsers();
      const counts = new Map<string, number>();
      for (const u of users) {
        if (u.isSuspended) continue;
        counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
      }
      return OUTLINE_ROLES.map((r) => ({
        ...r,
        userCount: counts.get(r.id) ?? 0,
      }));
    } catch {
      return OUTLINE_ROLES;
    }
  }

  async createRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError("outline", "createRole");
  }

  async updateRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError("outline", "updateRole");
  }

  async deleteRole(): Promise<void> {
    throw new ProviderUnsupportedError("outline", "deleteRole");
  }

  async assignUserRole(args: AssignUserRoleArgs): Promise<void> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError("outline");

    const user = await this.findUser(args.email);
    if (!user) {
      // User hasn't signed into Outline yet — first-login OIDC creates the
      // account with default "member". We can't pre-create without their
      // first token. assignUserRole on next sync will catch up.
      return;
    }

    // null = suspend (revoke access)
    if (args.roleId === null) {
      await outlineFetch("/api/users.suspend", { id: user.id });
      return;
    }

    const targetRole = args.roleId;
    if (!["admin", "member", "viewer"].includes(targetRole)) {
      throw new Error(`Outline: nieznana rola "${targetRole}"`);
    }

    // Resurrect if suspended.
    if (user.isSuspended) {
      await outlineFetch("/api/users.activate", { id: user.id });
    }

    if (user.role !== targetRole) {
      await outlineFetch("/api/users.update_role", {
        id: user.id,
        role: targetRole,
      });
    }
  }

  async getUserRole(email: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const user = await this.findUser(email);
    if (!user) return null;
    if (user.isSuspended) return null;
    return user.role;
  }

  async syncUserProfile(args: ProfileSyncArgs): Promise<void> {
    if (!this.isConfigured()) return;
    const lookup = args.previousEmail ?? args.email;
    const user = await this.findUser(lookup);
    if (!user) return; // JIT — zostanie utworzony przy pierwszym SSO.
    const updates: Record<string, string> = {};
    const fullName =
      [args.firstName, args.lastName].filter(Boolean).join(" ").trim() ||
      args.displayName ||
      "";
    if (fullName && fullName !== user.name) updates.name = fullName;
    // Outline /api/users.update wspiera tylko {id, name, avatarUrl}. Email
    // zmienia się tylko przez admin panel lub migrację SSO.
    if (Object.keys(updates).length === 0) return;
    await outlineFetch("/api/users.update", { id: user.id, ...updates });
  }

  private async findUser(email: string): Promise<OutlineUser | null> {
    try {
      // users.list supports `query` which searches by name/email substring.
      const users = await outlineFetch<OutlineUser[]>("/api/users.list", {
        query: email,
        filter: "all",
        limit: 25,
      });
      return (
        users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
      );
    } catch {
      return null;
    }
  }

  private async listUsers(): Promise<OutlineUser[]> {
    let offset = 0;
    const limit = 100;
    const all: OutlineUser[] = [];
    // Safety cap — we don't paginate beyond 1000 users.
    for (let i = 0; i < 10; i++) {
      const page = await outlineFetch<OutlineUser[]>("/api/users.list", {
        filter: "all",
        limit,
        offset,
      });
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < limit) break;
      offset += limit;
    }
    return all;
  }
}
