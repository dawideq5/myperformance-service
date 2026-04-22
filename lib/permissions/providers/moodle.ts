import { getOptionalEnv } from "@/lib/env";
import type {
  AssignUserRoleArgs,
  NativePermission,
  NativeRole,
  PermissionProvider,
} from "./types";
import { ProviderNotConfiguredError, ProviderUnsupportedError } from "./types";

/**
 * Moodle provider — integracja przez Moodle Web Services.
 *
 * Obsługuje system-level role (`manager`, `editingteacher`, `student`, …):
 *   - listRoles: `core_role_get_roles`
 *   - assignUserRole: `core_role_assign_roles` + `core_role_unassign_roles`
 *     w kontekście system (contextlevel=system, instanceid=1). Usuwa
 *     poprzednie system-level assignmenty zmapowanych seed ról przed
 *     dodaniem nowej — dzięki temu sync jest idempotentny.
 *   - getUserRole: `core_user_get_users_by_field` + filtr po mapowanych
 *     shortname'ach (pierwszy match z nativeRoleId listy).
 *
 * Custom role + edycja capabilities wymagają pluginu `local_mpkc_sync`
 * z dodatkowymi external functions — dlatego `supportsCustomRoles()=false`.
 */

interface Config {
  baseUrl: string;
  token: string;
}

function getConfig(): Config {
  const baseUrl = getOptionalEnv("MOODLE_URL");
  const token = getOptionalEnv("MOODLE_API_TOKEN");
  if (!baseUrl || !token) {
    throw new ProviderNotConfiguredError("moodle");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function moodleCall<T>(
  wsfunction: string,
  params: Record<string, string | number | Array<string | number | Record<string, string | number>>> = {},
): Promise<T> {
  const cfg = getConfig();
  const body = new URLSearchParams();
  body.set("wstoken", cfg.token);
  body.set("wsfunction", wsfunction);
  body.set("moodlewsrestformat", "json");
  flatten(params, body);
  const res = await fetch(`${cfg.baseUrl}/webservice/rest/server.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Moodle ${wsfunction} → HTTP ${res.status}`);
  const data = (await res.json()) as T & {
    exception?: string;
    errorcode?: string;
    message?: string;
  };
  if (data && typeof data === "object" && "exception" in data && data.exception) {
    throw new Error(`Moodle ${wsfunction}: ${data.message ?? data.exception}`);
  }
  return data as T;
}

function flatten(
  params: Record<string, unknown>,
  body: URLSearchParams,
  prefix = "",
): void {
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const idxKey = `${key}[${i}]`;
        if (item !== null && typeof item === "object") {
          flatten(item as Record<string, unknown>, body, idxKey);
        } else {
          body.set(idxKey, String(item));
        }
      });
    } else if (v !== null && typeof v === "object") {
      flatten(v as Record<string, unknown>, body, key);
    } else if (v !== undefined && v !== null) {
      body.set(key, String(v));
    }
  }
}

interface MoodleRoleRaw {
  id: number;
  name: string;
  shortname: string;
  description?: string;
  sortorder?: number;
  archetype?: string;
}

interface MoodleUserRaw {
  id: number;
  email?: string;
  username?: string;
  roles?: Array<{ shortname: string }>;
}

const BASELINE_MOODLE_ROLES: NativeRole[] = [
  {
    id: "student",
    name: "Uczeń (Student)",
    description: "Rola systemowa Moodle (student).",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "editingteacher",
    name: "Nauczyciel edytujący (Editing teacher)",
    description: "Rola systemowa Moodle (editing teacher).",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "teacher",
    name: "Nauczyciel bez edycji (Non-editing teacher)",
    description: "Rola systemowa Moodle (non-editing teacher).",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "manager",
    name: "Manager",
    description: "Rola systemowa Moodle (site-level manager).",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
];

/** Shortname'y seed ról mapowanych z KC → native. Używane do sprzątania. */
const MANAGED_SHORTNAMES = new Set(["student", "editingteacher", "manager"]);

export class MoodleProvider implements PermissionProvider {
  readonly id = "moodle";
  readonly label = "MyPerformance — Akademia (Moodle)";

  isConfigured(): boolean {
    try {
      getConfig();
      return true;
    } catch {
      return false;
    }
  }

  /** Custom role + edycja capabilities wymaga rozszerzenia local_mpkc_sync. */
  supportsCustomRoles(): boolean {
    return false;
  }

  async listPermissions(): Promise<NativePermission[]> {
    return [];
  }

  async listRoles(): Promise<NativeRole[]> {
    if (!this.isConfigured()) return [];
    try {
      const raw = await moodleCall<MoodleRoleRaw[]>("core_role_get_roles");
      return raw.map((r) => ({
        id: r.shortname,
        name: r.name || prettyShortname(r.shortname),
        description: r.description,
        permissions: [],
        systemDefined: true,
        userCount: null,
      }));
    } catch {
      return BASELINE_MOODLE_ROLES;
    }
  }

  createRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError(
      "moodle",
      "createRole wymaga rozszerzenia pluginu local_mpkc_sync",
    );
  }

  updateRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError(
      "moodle",
      "updateRole wymaga rozszerzenia pluginu local_mpkc_sync",
    );
  }

  deleteRole(): Promise<void> {
    throw new ProviderUnsupportedError(
      "moodle",
      "deleteRole wymaga rozszerzenia pluginu local_mpkc_sync",
    );
  }

  async assignUserRole(args: AssignUserRoleArgs): Promise<void> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError("moodle");

    const user = await this.findOrCreateUser(args.email, args.displayName);

    const allRoles = await moodleCall<MoodleRoleRaw[]>("core_role_get_roles");
    const byShort = new Map(allRoles.map((r) => [r.shortname, r]));

    // Usuwamy aktywne system-level assignmenty seed ról (żeby wymusić
    // single-role-per-area na warstwie Moodla).
    const currentShortnames = new Set(
      (user.roles ?? []).map((r) => r.shortname),
    );
    const toUnassign = [...MANAGED_SHORTNAMES].filter((s) =>
      currentShortnames.has(s),
    );
    for (const short of toUnassign) {
      if (short === args.roleId) continue;
      const role = byShort.get(short);
      if (!role) continue;
      await moodleCall("core_role_unassign_roles", {
        unassignments: [
          {
            roleid: role.id,
            userid: user.id,
            contextid: 1, // system context
          },
        ],
      }).catch(() => {
        // Moodle rzuci gdy brak takiego assignmentu — ignorujemy.
      });
    }

    if (!args.roleId) return;

    const desired = byShort.get(args.roleId);
    if (!desired) {
      throw new Error(`Moodle: rola shortname="${args.roleId}" nie istnieje`);
    }
    if (currentShortnames.has(args.roleId)) return; // already set

    await moodleCall("core_role_assign_roles", {
      assignments: [
        {
          roleid: desired.id,
          userid: user.id,
          contextid: 1, // system context
        },
      ],
    });
  }

  async getUserRole(email: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const user = await this.findUser(email);
    if (!user) return null;
    // Zwracamy pierwszy shortname który jest w zbiorze zarządzanych.
    const shortnames = (user.roles ?? []).map((r) => r.shortname);
    const primary = shortnames.find((s) => MANAGED_SHORTNAMES.has(s));
    return primary ?? shortnames[0] ?? null;
  }

  private async findUser(email: string): Promise<MoodleUserRaw | null> {
    try {
      const users = await moodleCall<MoodleUserRaw[]>(
        "core_user_get_users_by_field",
        { field: "email", values: [email] },
      );
      return users?.[0] ?? null;
    } catch {
      return null;
    }
  }

  private async findOrCreateUser(
    email: string,
    displayName: string,
  ): Promise<MoodleUserRaw> {
    const existing = await this.findUser(email);
    if (existing) return existing;

    const [firstName, ...rest] = (displayName || email).split(" ");
    const lastName = rest.join(" ").trim() || firstName || "User";
    const username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "") || email;
    const password = randomPassword();

    const created = await moodleCall<Array<{ id: number; username: string }>>(
      "core_user_create_users",
      {
        users: [
          {
            username,
            password,
            firstname: firstName || email,
            lastname: lastName,
            email,
            auth: "oidc",
            createpassword: 0,
          },
        ],
      },
    ).catch((err) => {
      // Gdy Moodle nie pozwala (np. username istnieje) — re-throw z kontekstem.
      throw new Error(`Moodle create user ${email}: ${err instanceof Error ? err.message : String(err)}`);
    });

    const row = Array.isArray(created) ? created[0] : null;
    if (!row) {
      throw new Error(`Moodle create user ${email}: brak odpowiedzi`);
    }
    return { id: row.id, email, username: row.username, roles: [] };
  }
}

function randomPassword(): string {
  const buf = new Uint8Array(20);
  crypto.getRandomValues(buf);
  // Moodle wymaga min. 1 digit + 1 lowercase + 1 uppercase + 1 nonalpha.
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return `Mp!${hex}Ax9`;
}

function prettyShortname(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}
