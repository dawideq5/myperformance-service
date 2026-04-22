import { getOptionalEnv } from "@/lib/env";
import type {
  AssignUserRoleArgs,
  NativePermission,
  NativeRole,
  PermissionProvider,
} from "./types";
import { ProviderNotConfiguredError } from "./types";

/**
 * Directus provider — natywna integracja z REST API Directus.
 *
 * Model Directusa:
 *   - `directus_roles` ma `admin_access` + `app_access` (bool flags) oraz
 *     linkowanie do `directus_permissions` (wiersz = collection + action).
 *   - `directus_users.role` trzyma FK do roli.
 *   - Rola "Administrator" jest system-defined (admin_access=true).
 *
 * Permissions udostępniamy jako sekwencję `collection:action` (read, create,
 * update, delete, share) dla każdej kolekcji widocznej w instancji. Dzięki
 * temu edytor roli pokazuje listę uprawnień na żywo z Directusa.
 */

interface Config {
  baseUrl: string;
  token: string;
}

function getConfig(): Config {
  const baseUrl =
    getOptionalEnv("DIRECTUS_URL") || getOptionalEnv("DIRECTUS_INTERNAL_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) {
    throw new ProviderNotConfiguredError("directus");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function directusFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = getConfig();
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Directus ${init.method ?? "GET"} ${path} → ${res.status} ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return null as T;
  const data = (await res.json()) as { data?: T };
  return (data.data ?? data) as T;
}

interface DirectusRoleRaw {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  admin_access?: boolean;
  app_access?: boolean;
  users?: unknown[] | number;
}

interface DirectusPermissionRaw {
  id: number;
  role: string | null;
  collection: string;
  action: string;
  fields?: string[] | null;
}

interface DirectusUserRaw {
  id: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role: string | null;
  status?: string;
}

interface DirectusCollectionRaw {
  collection: string;
  meta?: { hidden?: boolean; system?: boolean } | null;
}

const DIRECTUS_ACTIONS = ["create", "read", "update", "delete", "share"] as const;

export class DirectusProvider implements PermissionProvider {
  readonly id = "directus";
  readonly label = "Directus CMS";

  isConfigured(): boolean {
    try {
      getConfig();
      return true;
    } catch {
      return false;
    }
  }

  supportsCustomRoles(): boolean {
    return true;
  }

  async listPermissions(): Promise<NativePermission[]> {
    if (!this.isConfigured()) return [];
    const collections = await directusFetch<DirectusCollectionRaw[]>(
      "/collections?limit=-1",
    ).catch(() => [] as DirectusCollectionRaw[]);
    const visible = collections.filter(
      (c) => !c.collection.startsWith("directus_") && !c.meta?.hidden,
    );

    const out: NativePermission[] = [];
    for (const col of visible) {
      for (const action of DIRECTUS_ACTIONS) {
        out.push({
          key: `${col.collection}:${action}`,
          label: `${humanAction(action)} — ${col.collection}`,
          group: col.collection,
        });
      }
    }
    return out.sort((a, b) =>
      a.group === b.group ? a.label.localeCompare(b.label) : a.group.localeCompare(b.group),
    );
  }

  async listRoles(): Promise<NativeRole[]> {
    if (!this.isConfigured()) return [];
    const [roles, permissions, userCounts] = await Promise.all([
      directusFetch<DirectusRoleRaw[]>("/roles?limit=-1"),
      directusFetch<DirectusPermissionRaw[]>("/permissions?limit=-1&fields=id,role,collection,action")
        .catch(() => [] as DirectusPermissionRaw[]),
      this.countUsersPerRole(),
    ]);

    const permsByRole = new Map<string, string[]>();
    for (const p of permissions) {
      if (!p.role) continue;
      const bucket = permsByRole.get(p.role) ?? [];
      bucket.push(`${p.collection}:${p.action}`);
      permsByRole.set(p.role, bucket);
    }

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
      permissions: r.admin_access
        ? ["*:*"]
        : Array.from(new Set(permsByRole.get(r.id) ?? [])),
      systemDefined: Boolean(r.admin_access),
      userCount: userCounts.get(r.id) ?? 0,
    }));
  }

  private async countUsersPerRole(): Promise<Map<string, number>> {
    const users = await directusFetch<Array<Pick<DirectusUserRaw, "id" | "role">>>(
      "/users?limit=-1&fields=id,role",
    ).catch(() => []);
    const counts = new Map<string, number>();
    for (const u of users) {
      if (!u.role) continue;
      counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    }
    return counts;
  }

  async createRole(args: {
    name: string;
    description?: string;
    permissions: string[];
  }): Promise<NativeRole> {
    const role = await directusFetch<DirectusRoleRaw>("/roles", {
      method: "POST",
      body: JSON.stringify({
        name: args.name,
        description: args.description ?? "",
        admin_access: false,
        app_access: true,
      }),
    });
    await this.syncPermissions(role.id, args.permissions);
    return {
      id: role.id,
      name: role.name,
      description: role.description ?? undefined,
      permissions: args.permissions,
      systemDefined: false,
      userCount: 0,
    };
  }

  async updateRole(
    id: string,
    args: { name?: string; description?: string; permissions?: string[] },
  ): Promise<NativeRole> {
    const existing = await directusFetch<DirectusRoleRaw>(
      `/roles/${encodeURIComponent(id)}`,
    );
    if (existing.admin_access) {
      throw new Error(
        "Rola Administrator Directusa jest systemowa — nie można jej modyfikować",
      );
    }

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (Object.keys(patch).length > 0) {
      await directusFetch(`/roles/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    }

    if (args.permissions) {
      await this.syncPermissions(id, args.permissions);
    }

    const updated = await directusFetch<DirectusRoleRaw>(
      `/roles/${encodeURIComponent(id)}`,
    );
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description ?? undefined,
      permissions: args.permissions ?? [],
      systemDefined: false,
      userCount: 0,
    };
  }

  async deleteRole(id: string): Promise<void> {
    const existing = await directusFetch<DirectusRoleRaw>(
      `/roles/${encodeURIComponent(id)}`,
    );
    if (existing.admin_access) {
      throw new Error("Nie można usunąć systemowej roli Administratora Directus");
    }
    // Usuwamy permissions przypisane do tej roli (Directus nie robi CASCADE w API).
    const perms = await directusFetch<DirectusPermissionRaw[]>(
      `/permissions?filter[role][_eq]=${encodeURIComponent(id)}&fields=id&limit=-1`,
    ).catch(() => [] as DirectusPermissionRaw[]);
    if (perms.length > 0) {
      await directusFetch("/permissions", {
        method: "DELETE",
        body: JSON.stringify(perms.map((p) => p.id)),
      });
    }
    await directusFetch(`/roles/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async assignUserRole(args: AssignUserRoleArgs): Promise<void> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError("directus");
    const user = await this.findUserByEmail(args.email);
    if (!user) {
      // Directus użytkownicy są tworzeni przez SSO flow przy pierwszym
      // logowaniu — nie robimy tu pre-create, bo Directus wymaga podania
      // roli jako identyfikatora UUID (którego nie znamy bez wcześniejszego
      // wyboru). Po prostu zapisujemy noop; gdy user zaloguje się przez
      // SSO, AUTH_KEYCLOAK_DEFAULT_ROLE_ID da mu minimalną rolę, a admin
      // może go wtedy przepisać.
      return;
    }
    await directusFetch(`/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ role: args.roleId }),
    });
  }

  async getUserRole(email: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const user = await this.findUserByEmail(email);
    return user?.role ?? null;
  }

  private async findUserByEmail(email: string): Promise<DirectusUserRaw | null> {
    const filter = encodeURIComponent(email.toLowerCase());
    const users = await directusFetch<DirectusUserRaw[]>(
      `/users?filter[email][_eq]=${filter}&limit=1&fields=id,email,role,first_name,last_name,status`,
    ).catch(() => [] as DirectusUserRaw[]);
    return users[0] ?? null;
  }

  private async syncPermissions(roleId: string, target: string[]): Promise<void> {
    const existing = await directusFetch<DirectusPermissionRaw[]>(
      `/permissions?filter[role][_eq]=${encodeURIComponent(roleId)}&fields=id,collection,action&limit=-1`,
    ).catch(() => [] as DirectusPermissionRaw[]);
    const desired = new Set(target);
    const existingKeys = new Map<string, number>();
    for (const p of existing) existingKeys.set(`${p.collection}:${p.action}`, p.id);

    const toRemove: number[] = [];
    for (const [key, id] of existingKeys) {
      if (!desired.has(key)) toRemove.push(id);
    }
    const toAdd = Array.from(desired).filter((k) => !existingKeys.has(k));

    if (toRemove.length > 0) {
      await directusFetch("/permissions", {
        method: "DELETE",
        body: JSON.stringify(toRemove),
      });
    }
    if (toAdd.length > 0) {
      const bulk = toAdd.map((key) => {
        const [collection, action] = key.split(":");
        return { role: roleId, collection, action, fields: ["*"] };
      });
      await directusFetch("/permissions", {
        method: "POST",
        body: JSON.stringify(bulk),
      });
    }
  }
}

function humanAction(action: string): string {
  switch (action) {
    case "create":
      return "Tworzenie";
    case "read":
      return "Odczyt";
    case "update":
      return "Edycja";
    case "delete":
      return "Usuwanie";
    case "share":
      return "Udostępnianie";
    default:
      return action;
  }
}
