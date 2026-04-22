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
 * **Status: read-only (Phase 1).** Listujemy role i capabilities natywne
 * Moodla przez `core_role_get_roles` + `core_role_get_capability_info_for_roles`.
 * CRUD ról + przypisywanie userów będzie wymagało rozszerzenia pluginu
 * `local_mpkc_sync` (Phase 2). Póki co panel pokazuje stan Moodle, ale
 * pełnia edycji blokujemy na tym etapie.
 *
 * Mapowanie realm role KC → Moodle system role (shortname) odbywa się w
 * `areas.ts` (`nativeRoleId` per seed). Gdy user dostaje `moodle_teacher`
 * w KC i jesteśmy w Phase 2, assignUserRole nawoła `local_mpkc_sync_assign_user`.
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
  params: Record<string, string | number | Array<string | number>> = {},
): Promise<T> {
  const cfg = getConfig();
  const body = new URLSearchParams();
  body.set("wstoken", cfg.token);
  body.set("wsfunction", wsfunction);
  body.set("moodlewsrestformat", "json");
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      v.forEach((item, i) => body.set(`${k}[${i}]`, String(item)));
    } else {
      body.set(k, String(v));
    }
  }
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

interface MoodleRoleRaw {
  id: number;
  name: string;
  shortname: string;
  description?: string;
  sortorder?: number;
  archetype?: string;
}

/**
 * Baseline systemowych ról Moodla — fallback gdy `core_role_get_roles` nie
 * jest dostępne (stare wersje / brak webservice capability). W PROD Moodle
 * zwraca pełną listę.
 */
const BASELINE_MOODLE_ROLES: NativeRole[] = [
  {
    id: "student",
    name: "Uczeń",
    description: "Rola systemowa Moodle (student).",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "editingteacher",
    name: "Nauczyciel (edytujący)",
    description: "Rola systemowa Moodle (editing teacher).",
    permissions: [],
    systemDefined: true,
    userCount: null,
  },
  {
    id: "teacher",
    name: "Nauczyciel (bez edycji)",
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

  /**
   * Moodle pozwala na custom role, ale wymagałoby to WS-function z pluginu
   * `local_mpkc_sync`. Dopóki go nie wdrożymy (Phase 2) — read-only.
   */
  supportsCustomRoles(): boolean {
    return false;
  }

  async listPermissions(): Promise<NativePermission[]> {
    if (!this.isConfigured()) return [];
    // Moodle ma setki capabilities. Dla Phase 1 zwracamy pustą listę —
    // edytor roli jest disabled (supportsCustomRoles=false). Phase 2
    // uzupełni przez `core_role_get_capability_info_for_roles`.
    return [];
  }

  async listRoles(): Promise<NativeRole[]> {
    if (!this.isConfigured()) return [];
    try {
      const raw = await moodleCall<MoodleRoleRaw[]>("core_role_get_roles");
      return raw.map((r) => ({
        id: r.shortname,
        name: r.name || r.shortname,
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
      "createRole (wymaga pluginu local_mpkc_sync — Phase 2)",
    );
  }

  updateRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError(
      "moodle",
      "updateRole (wymaga pluginu local_mpkc_sync — Phase 2)",
    );
  }

  deleteRole(): Promise<void> {
    throw new ProviderUnsupportedError(
      "moodle",
      "deleteRole (wymaga pluginu local_mpkc_sync — Phase 2)",
    );
  }

  async assignUserRole(args: AssignUserRoleArgs): Promise<void> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError("moodle");
    // Phase 1: operacja delegowana do SSO flow Moodla. Dashboard odznacza
    // rolę tylko w KC — przy następnym logowaniu Moodle auth_oidc mapping
    // aktualizuje rolę natywną. Assign jest więc no-op z tego kierunku.
    // Phase 2: wywołanie `local_mpkc_sync_assign_user(email, roleshortname)`.
    void args;
  }

  async getUserRole(email: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    try {
      const users = await moodleCall<Array<{ id: number; roles?: Array<{ shortname: string }> }>>(
        "core_user_get_users_by_field",
        { field: "email", "values[0]": email },
      );
      const user = users?.[0];
      const primary = user?.roles?.[0]?.shortname;
      return primary ?? null;
    } catch {
      return null;
    }
  }
}
