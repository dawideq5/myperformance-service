import mysql from "mysql2/promise";
import { getOptionalEnv } from "@/lib/env";
import type {
  AssignUserRoleArgs,
  NativePermission,
  NativeRole,
  PermissionProvider,
  ProfileSyncArgs,
} from "./types";
import { ProviderNotConfiguredError, ProviderUnsupportedError } from "./types";

// ── DB fallback dla listRoles ────────────────────────────────────────────────
// `core_role_get_roles` WS failuje w Moodle 5.x ("Nie znaleziono rekordu")
// przy pustym contextid. Dashboard czyta `mdl_role` directnie przez
// MOODLE_DB_URL gdy jest skonfigurowany — dzięki temu custom role dodane
// przez admina Moodle (Site admin → Users → Permissions → Define roles)
// pojawiają się w UI dashboardu przy kolejnym kc-sync.
let dbPool: mysql.Pool | null = null;
function getDbPool(): mysql.Pool | null {
  const url = getOptionalEnv("MOODLE_DB_URL");
  if (!url) return null;
  if (!dbPool) {
    dbPool = mysql.createPool({
      uri: url,
      connectionLimit: 3,
      waitForConnections: true,
    });
  }
  return dbPool;
}

interface MoodleDbRole {
  id: number;
  shortname: string;
  name: string | null;
  description: string | null;
}

async function listRolesFromDb(): Promise<MoodleDbRole[] | null> {
  const pool = getDbPool();
  if (!pool) return null;
  try {
    const [rows] = await pool.query(
      "SELECT id, shortname, name, description FROM mdl_role ORDER BY sortorder",
    );
    return rows as MoodleDbRole[];
  } catch {
    return null;
  }
}

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

/**
 * Baseline — używane gdy `core_role_get_roles` failuje. Pokrywa rdzeń
 * Moodle (identyczne shortname'y w każdej instalacji). Pełna lista ról
 * (autor kursu, frontpage, guest, editingteacher, teacher itd.) jest
 * pobierana dynamicznie z Moodla.
 */
const BASELINE_MOODLE_ROLES: NativeRole[] = [
  {
    id: "manager",
    name: "Menedżer",
    description: "Rola systemowa Moodle — site-level manager.",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "coursecreator",
    name: "Autor kursu",
    description: "Rola systemowa Moodle — tworzenie nowych kursów.",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "editingteacher",
    name: "Nauczyciel",
    description: "Rola systemowa Moodle — nauczyciel z prawami edycji.",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "teacher",
    name: "Nauczyciel bez praw edycji",
    description: "Rola systemowa Moodle — ocenianie bez edycji kursów.",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "student",
    name: "Student",
    description: "Rola systemowa Moodle — uczestnik kursów.",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "guest",
    name: "Gość",
    description: "Rola systemowa Moodle — tylko podgląd kursów publicznych.",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "user",
    name: "Uwierzytelniony użytkownik",
    description: "Rola systemowa Moodle — każdy zalogowany użytkownik.",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "frontpage",
    name: "Uwierzytelniony użytkownik na stronie głównej",
    description: "Rola systemowa Moodle — dostęp do aktywności strony głównej.",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
];

/**
 * Heurystyczne mapowanie angielskich Moodle-owych nazw ról na polskie.
 * Moodle zwraca nazwy w języku instancji — jeśli nie ma polskiego
 * language packa, zwraca defaulty po angielsku. Zachowujemy te PL-owe
 * tytuły niezależnie od języka instancji.
 */
const PL_LABELS: Record<string, string> = {
  manager: "Menedżer",
  coursecreator: "Autor kursu",
  editingteacher: "Nauczyciel",
  teacher: "Nauczyciel bez praw edycji",
  student: "Student",
  guest: "Gość",
  user: "Uwierzytelniony użytkownik",
  frontpage: "Uwierzytelniony użytkownik na stronie głównej",
};

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

    // Kolejność: DB (pełna lista w tym custom role) → WS → BASELINE.
    // `core_role_get_roles` WS jest zbuggowane w Moodle 5.x, więc DB jest
    // preferowane gdy MOODLE_DB_URL jest skonfigurowany.
    const dbRoles = await listRolesFromDb();
    if (dbRoles && dbRoles.length > 0) {
      return dbRoles
        .filter((r) => r.shortname && r.shortname.trim())
        .map((r) => ({
          id: r.shortname,
          name:
            PL_LABELS[r.shortname] ||
            (r.name && r.name.trim()) ||
            prettyShortname(r.shortname),
          description: r.description ?? undefined,
          permissions: [],
          // Custom role = id > 8 (archetypes mają id 1-8 w każdej instalacji).
          systemDefined: r.id <= 8,
          userCount: null,
        }));
    }

    try {
      const raw = await moodleCall<MoodleRoleRaw[]>("core_role_get_roles");
      if (!Array.isArray(raw) || raw.length === 0) return BASELINE_MOODLE_ROLES;
      return raw
        .filter((r) => r.shortname && r.shortname.trim())
        .map((r) => ({
          id: r.shortname,
          name:
            PL_LABELS[r.shortname] ||
            (r.name && r.name.trim()) ||
            prettyShortname(r.shortname),
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

    // Mapowanie shortname → role id. Pierwszeństwo: DB (pełna lista w tym
    // custom role), potem WS, potem hardcoded fallback dla 8 archetypes.
    let byShort: Map<string, MoodleRoleRaw>;
    const dbRoles = await listRolesFromDb();
    if (dbRoles && dbRoles.length > 0) {
      byShort = new Map(
        dbRoles.map((r) => [
          r.shortname,
          { id: r.id, name: r.name ?? r.shortname, shortname: r.shortname } as MoodleRoleRaw,
        ]),
      );
    } else {
      const FALLBACK_ROLE_IDS: Record<string, number> = {
        manager: 1,
        coursecreator: 2,
        editingteacher: 3,
        teacher: 4,
        student: 5,
        guest: 6,
        user: 7,
        frontpage: 8,
      };
      try {
        const allRoles = await moodleCall<MoodleRoleRaw[]>("core_role_get_roles");
        byShort = new Map(allRoles.map((r) => [r.shortname, r]));
      } catch {
        byShort = new Map(
          Object.entries(FALLBACK_ROLE_IDS).map(([shortname, id]) => [
            shortname,
            { id, name: shortname, shortname } as MoodleRoleRaw,
          ]),
        );
      }
    }

    // Zbiór wszystkich znanych shortname'ów = "zarządzane" przez dashboard.
    // Enforcement single-role-per-area: zdejmujemy wszystkie system-level
    // assignmenty z tego zbioru, poza rolą, którą chcemy zostawić.
    const managed = new Set(byShort.keys());
    const currentShortnames = new Set(
      (user.roles ?? []).map((r) => r.shortname),
    );
    for (const short of currentShortnames) {
      if (!managed.has(short)) continue;
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
    // Zwracamy shortname o najwyższym priorytecie (manager > editingteacher >
    // teacher > student > ...). Gdy user ma wiele ról systemowych z historii,
    // pokazujemy tę "najmocniejszą".
    const priority = [
      "manager",
      "coursecreator",
      "editingteacher",
      "teacher",
      "student",
      "user",
      "frontpage",
      "guest",
    ];
    const shortnames = new Set(
      (user.roles ?? []).map((r) => r.shortname),
    );
    for (const s of priority) {
      if (shortnames.has(s)) return s;
    }
    return [...shortnames][0] ?? null;
  }

  async syncUserProfile(args: ProfileSyncArgs): Promise<void> {
    if (!this.isConfigured()) return;
    const lookup = args.previousEmail ?? args.email;
    const user = await this.findUser(lookup);
    if (!user) return; // Brak w Moodle — sync przy najbliższym SSO loginie.
    const update: Record<string, string | number> = { id: user.id };
    if (args.firstName) update.firstname = args.firstName;
    if (args.lastName) update.lastname = args.lastName;
    if (args.email && args.email.toLowerCase() !== user.email?.toLowerCase()) {
      update.email = args.email;
    }
    if (args.phone) update.phone1 = args.phone;
    if (Object.keys(update).length === 1) return; // Tylko id — nic do zmiany.
    await moodleCall("core_user_update_users", { users: [update] });
  }

  async deleteUser(args: { email: string; previousEmail?: string }): Promise<void> {
    if (!this.isConfigured()) return;
    const lookup = args.previousEmail ?? args.email;
    const user = await this.findUser(lookup);
    if (!user) return;
    // core_user_delete_users — Moodle robi soft delete (deleted=1, anonimizuje
    // email + username). Zachowuje audit + completion records, blokuje login.
    // Dodatkowo usuwamy auth_oidc_token entry żeby przy ewentualnym ponownym
    // utworzeniu user-a w KC z tym samym sub nie matchował starej duszy.
    await moodleCall("core_user_delete_users", { userids: [user.id] });
    const pool = getDbPool();
    if (pool) {
      await pool
        .query("DELETE FROM mdl_auth_oidc_token WHERE userid = ?", [user.id])
        .catch(() => undefined);
    }
  }

  async listUserEmails(): Promise<string[] | null> {
    if (!this.isConfigured()) return null;
    const pool = getDbPool();
    if (pool) {
      const [rows] = await pool.query(
        `SELECT email FROM mdl_user WHERE deleted = 0 AND auth = 'oidc' AND email IS NOT NULL AND email <> ''`,
      );
      return (rows as Array<{ email: string }>).map((r) => r.email.toLowerCase());
    }
    // Fallback przez WS — Moodle wymaga query, więc paginacja po '@'.
    try {
      const users = await moodleCall<MoodleUserRaw[]>(
        "core_user_get_users",
        { criteria: [{ key: "auth", value: "oidc" }] },
      );
      const arr = (users as unknown as { users?: MoodleUserRaw[] }).users
        ?? (Array.isArray(users) ? users : []);
      return arr
        .map((u) => u.email?.toLowerCase())
        .filter((e): e is string => !!e);
    } catch {
      return null;
    }
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
    // Moodle username MUSI matchować KC `preferred_username` claim (Moodle
    // auth_oidc szuka po `bindingusernameclaim`). KC default = email, więc
    // używamy całego emaila jako username (lowercase). Inaczej plugin
    // przy pierwszym SSO logowaniu zwraca: "Nieprawidłowe dane logowania:
    // nie znaleziono użytkownika w platformie Moodle".
    const username = email.toLowerCase();
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
