import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
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
 * Outline (knowledge base) provider — **"Groups-as-Containers"**.
 *
 * Outline API nie pozwala tworzyć nowych ról globalnych (admin/member/viewer
 * to zamknięty enum). Zgodnie z raportem IAM — custom metarole realizujemy
 * przez tworzenie natywnej **Group** w Outline i dopinanie do niej użytkowników.
 * Wtedy administrator może w Outline UI nadać tej grupie uprawnienia do
 * konkretnych kolekcji (read / read-write / no-access).
 *
 * Konwencja id natywnej roli:
 *   `admin` / `member` / `viewer`           — globalna rola Outline
 *   `group:<outlineGroupId>`                — custom metarola = grupa Outline
 *
 * Przy assign:
 *   - globalna rola → `users.update_role` + `users.activate`/`users.suspend`
 *   - grupa → `groups.add_user` + zapewnienie globalnego `member` (żeby
 *     user mógł się zalogować), + wywłaszczenie z innych zarządzanych grup
 *     (single-role-per-area).
 *
 * API docs: https://www.getoutline.com/developers
 */

const logger = log.child({ module: "outline-provider" });

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

interface OutlineGroup {
  id: string;
  name: string;
  memberCount?: number;
}

const GROUP_PREFIX = "group:";

/** Marker w name grupy — odróżnia metarole od istniejących ad-hoc grup. */
const METAROLE_MARKER = "[metarole]";

const OUTLINE_GLOBAL_ROLES: NativeRole[] = [
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

function isGroupRoleId(id: string): boolean {
  return id.startsWith(GROUP_PREFIX);
}

function groupIdFromRoleId(id: string): string {
  return id.slice(GROUP_PREFIX.length);
}

function roleIdForGroup(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

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
    // Grupy Outline (fine-grained scope na kolekcjach) edytuje się w
    // Outline → Settings → Groups. Dashboard trzyma tylko dwie role:
    // member (knowledge_user) i admin (knowledge_admin).
    return false;
  }

  async listPermissions(): Promise<NativePermission[]> {
    return OUTLINE_PERMISSIONS;
  }

  async listRoles(): Promise<NativeRole[]> {
    if (!this.isConfigured()) return [];
    const result: NativeRole[] = [];
    try {
      const users = await this.listUsers();
      const counts = new Map<string, number>();
      for (const u of users) {
        if (u.isSuspended) continue;
        counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
      }
      for (const r of OUTLINE_GLOBAL_ROLES) {
        result.push({ ...r, userCount: counts.get(r.id) ?? 0 });
      }
    } catch {
      result.push(...OUTLINE_GLOBAL_ROLES);
    }

    // Metarole-groups jako custom roles.
    try {
      const groups = await this.listMetaroleGroups();
      for (const g of groups) {
        result.push({
          id: roleIdForGroup(g.id),
          name: g.name.replace(METAROLE_MARKER, "").trim(),
          description: "Metarola (grupa Outline) — uprawnienia per kolekcja.",
          permissions: [],
          systemDefined: false,
          userCount: g.memberCount ?? null,
        });
      }
    } catch (err) {
      logger.warn("listMetaroleGroups failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
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
      // User hasn't signed into Outline yet — JIT create przy pierwszym SSO.
      // assignUserRole następny cykl dopina ponownie.
      return;
    }

    // null = zabranie dostępu (suspend).
    if (args.roleId === null) {
      await outlineFetch("/api/users.suspend", { id: user.id });
      return;
    }

    // Wariant A: assigning natywnej global role.
    if (!isGroupRoleId(args.roleId)) {
      const targetRole = args.roleId;
      if (!["admin", "member", "viewer"].includes(targetRole)) {
        throw new Error(`Outline: nieznana rola "${targetRole}"`);
      }
      if (user.isSuspended) {
        await outlineFetch("/api/users.activate", { id: user.id });
      }
      if (user.role !== targetRole) {
        await outlineFetch("/api/users.update_role", {
          id: user.id,
          role: targetRole,
        });
      }
      // Czyszczenie — jeśli user był w metarole-groups, zostaje; globalny
      // role i grupy żyją równolegle w Outline (grupa decyduje o per-collection).
      return;
    }

    // Wariant B: assigning metarole-group.
    const groupId = groupIdFromRoleId(args.roleId);

    if (user.isSuspended) {
      await outlineFetch("/api/users.activate", { id: user.id });
    }
    // Upewniamy się że user ma globalne `member` (wymagane żeby w ogóle
    // zalogować i widzieć grupy/kolekcje).
    if (user.role !== "member" && user.role !== "admin") {
      await outlineFetch("/api/users.update_role", {
        id: user.id,
        role: "member",
      });
    }
    // Wypinamy z innych metarole-group (single-role-per-area).
    try {
      const otherGroups = await this.listMetaroleGroups();
      for (const g of otherGroups) {
        if (g.id === groupId) continue;
        await outlineFetch("/api/groups.remove_user", {
          id: g.id,
          userId: user.id,
        }).catch(() => {
          // Outline zwraca 400 gdy user nie jest w grupie — ignorujemy.
        });
      }
    } catch (err) {
      logger.warn("metarole group cleanup failed (non-fatal)", {
        email: args.email,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    // Dopinamy do docelowej grupy.
    await outlineFetch("/api/groups.add_user", {
      id: groupId,
      userId: user.id,
    }).catch(async (err: unknown) => {
      // Outline zwraca 400 gdy user już jest w grupie — traktujemy jako OK.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already/i.test(msg)) throw err;
    });
  }

  async getUserRole(email: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const user = await this.findUser(email);
    if (!user) return null;
    if (user.isSuspended) return null;

    // Preferuj metarole-group (jeśli user jest w dokładnie jednej).
    try {
      const groups = await this.listMetaroleGroups();
      for (const g of groups) {
        const members = await outlineFetch<OutlineUser[]>(
          "/api/groups.memberships",
          { id: g.id, limit: 100 },
        ).catch(() => [] as OutlineUser[]);
        if (members.some((m) => m.id === user.id)) {
          return roleIdForGroup(g.id);
        }
      }
    } catch {
      // fall through — zwrócimy global role.
    }
    return user.role;
  }

  async syncUserProfile(args: ProfileSyncArgs): Promise<void> {
    if (!this.isConfigured()) return;
    const lookup = args.previousEmail ?? args.email;
    const user = await this.findUser(lookup);
    if (!user) return;
    const updates: Record<string, string> = {};
    const fullName =
      [args.firstName, args.lastName].filter(Boolean).join(" ").trim() ||
      args.displayName ||
      "";
    if (fullName && fullName !== user.name) updates.name = fullName;
    if (Object.keys(updates).length === 0) return;
    await outlineFetch("/api/users.update", { id: user.id, ...updates });
  }

  async deleteUser(args: { email: string; previousEmail?: string }): Promise<void> {
    if (!this.isConfigured()) return;
    const lookup = args.previousEmail ?? args.email;
    const user = await this.findUser(lookup);
    if (!user) return;
    // Outline supports `users.delete` (hard) and `users.suspend` (soft).
    // Soft delete preferowany — zachowuje autorstwo dokumentów i komentarzy.
    if (!user.isSuspended) {
      await outlineFetch("/api/users.suspend", { id: user.id });
    }
  }

  async listUserEmails(): Promise<string[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const all = await this.listUsers();
      return all
        .map((u) => u.email?.toLowerCase())
        .filter((e): e is string => !!e);
    } catch {
      return null;
    }
  }

  private async findUser(email: string): Promise<OutlineUser | null> {
    try {
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

  /**
   * Listuje grupy oznaczone markerem `[metarole]` — tylko te grupy
   * traktujemy jako custom role zarządzane z centralnego IAM. Istniejące
   * ad-hoc grupy (np. zespoły projektowe) są ignorowane.
   */
  private async listMetaroleGroups(): Promise<OutlineGroup[]> {
    const all: OutlineGroup[] = [];
    let offset = 0;
    const limit = 100;
    for (let i = 0; i < 10; i++) {
      const page = await outlineFetch<OutlineGroup[]>("/api/groups.list", {
        limit,
        offset,
      });
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < limit) break;
      offset += limit;
    }
    return all.filter((g) => g.name.includes(METAROLE_MARKER));
  }
}
