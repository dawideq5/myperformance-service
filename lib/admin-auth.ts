import type { Session } from "next-auth";
import { ApiError } from "@/lib/api-errors";
import { AREAS, findAreaForRole, type AreaRoleSeed } from "@/lib/permissions/areas";

/**
 * Realm-wide role catalog.
 *
 * Role `<service>_<tier>` mapują się 1:1 na seed roles z `areas.ts`.
 * Source-of-truth dla catalogu pozostaje `areas.ts` — ten plik eksportuje
 * "gotowe" nazwy ról (string literals) żeby reszta aplikacji nie musiała
 * importować i iterować AREAS przy każdym `hasRole` checku.
 *
 * Wszystkie role są non-default (przypisywane explicite w `/admin/users`),
 * za wyjątkiem `app_user` (każdy zalogowany) i `kadromierz_user` (default).
 */
export const ROLES = {
  APP_USER: "app_user",

  // Panel zarządzania użytkownikami (część IAM — wymaga keycloak_admin).
  MANAGE_USERS: "manage_users",

  // Client certs (/admin/certificates)
  CERTIFICATES_ADMIN: "certificates_admin",

  // Kadromierz — default-true
  KADROMIERZ_USER: "kadromierz_user",

  // Directus CMS — admin-only
  DIRECTUS_ADMIN: "directus_admin",

  // Documenso — 3 tiery
  DOCUMENSO_MEMBER: "documenso_member",
  DOCUMENSO_MANAGER: "documenso_manager",
  DOCUMENSO_ADMIN: "documenso_admin",

  // Chatwoot — 2 tiery
  CHATWOOT_AGENT: "chatwoot_agent",
  CHATWOOT_ADMIN: "chatwoot_admin",

  // Postal — admin-only
  POSTAL_ADMIN: "postal_admin",

  // Keycloak (admin console)
  KEYCLOAK_ADMIN: "keycloak_admin",

  // Step CA
  STEPCA_ADMIN: "stepca_admin",

  // Moodle — pełna lista ról pobierana dynamicznie z providera,
  // seed zawiera tylko pewną bazę.
  MOODLE_STUDENT: "moodle_student",
  MOODLE_MANAGER: "moodle_manager",

  // Knowledge base (Outline) — 3 tiery
  KNOWLEDGE_VIEWER: "knowledge_viewer",
  KNOWLEDGE_EDITOR: "knowledge_editor",
  KNOWLEDGE_ADMIN: "knowledge_admin",

  // Wazuh SIEM
  WAZUH_ADMIN: "wazuh_admin",

  // Dashboard admin sections — niezależne od Keycloak admin
  INFRASTRUCTURE_ADMIN: "infrastructure_admin",
  EMAIL_ADMIN: "email_admin",
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export interface RoleSpec {
  name: AppRole;
  description: string;
  /** Auto-granted to every authenticated user when true. */
  default: boolean;
}

export const ROLE_CATALOG: RoleSpec[] = [
  { name: ROLES.APP_USER, description: "Dostęp do dashboardu (wymagany dla każdego uwierzytelnionego użytkownika)", default: true },

  { name: ROLES.MANAGE_USERS, description: "Zarządzanie kontami użytkowników w panelu /admin/users", default: false },
  { name: ROLES.CERTIFICATES_ADMIN, description: "Wydawanie i odwoływanie certyfikatów klienckich", default: false },
  { name: ROLES.KADROMIERZ_USER, description: "Integracja Kadromierz (grafik, ewidencja czasu)", default: true },

  { name: ROLES.DIRECTUS_ADMIN, description: "Directus: administrator", default: false },

  { name: ROLES.DOCUMENSO_MEMBER, description: "Documenso: użytkownik (własne dokumenty)", default: false },
  { name: ROLES.DOCUMENSO_MANAGER, description: "Documenso: menedżer zespołu", default: false },
  { name: ROLES.DOCUMENSO_ADMIN, description: "Documenso: administrator", default: false },

  { name: ROLES.CHATWOOT_AGENT, description: "Chatwoot: agent obsługi klienta", default: false },
  { name: ROLES.CHATWOOT_ADMIN, description: "Chatwoot: administrator", default: false },

  { name: ROLES.POSTAL_ADMIN, description: "Postal: administrator", default: false },

  { name: ROLES.KEYCLOAK_ADMIN, description: "Konsola administracyjna Keycloak", default: false },
  { name: ROLES.STEPCA_ADMIN, description: "Administrator step-ca", default: false },

  { name: ROLES.MOODLE_STUDENT, description: "Moodle: student (dostęp do kursów)", default: false },
  { name: ROLES.MOODLE_MANAGER, description: "Moodle: menedżer instancji", default: false },

  { name: ROLES.KNOWLEDGE_VIEWER, description: "Outline: widz (tylko odczyt)", default: false },
  { name: ROLES.KNOWLEDGE_EDITOR, description: "Outline: edytor (tworzenie i edycja)", default: true },
  { name: ROLES.KNOWLEDGE_ADMIN, description: "Outline: administrator", default: false },

  { name: ROLES.WAZUH_ADMIN, description: "Wazuh SIEM: administrator", default: false },

  { name: ROLES.INFRASTRUCTURE_ADMIN, description: "/admin/infrastructure — VPS, DNS, snapshoty, backupy, monitoring, Wazuh/SIEM", default: false },
  { name: ROLES.EMAIL_ADMIN, description: "/admin/email — branding, KC templates, Postal, catalog", default: false },
];

/**
 * Keycloak realm-management roles that implicitly grant full admin.
 */
const SUPERADMIN_ROLES = ["realm-admin", "manage-realm", "admin"];

/**
 * Per-panel external apps — each panel is a standalone Next.js app behind
 * mTLS. The role gates access to Keycloak SSO login for that panel.
 */
export const PANEL_ROLES = {
  sprzedawca: "sprzedawca",
  serwisant: "serwisant",
  kierowca: "kierowca",
} as const;

export type PanelKey = keyof typeof PANEL_ROLES;

function rolesOf(session: Session | null | undefined): string[] {
  return session?.user?.roles ?? [];
}

function hasAny(session: Session | null | undefined, roles: string[]): boolean {
  const own = rolesOf(session);
  if (!own.length) return false;
  return roles.some((role) => own.includes(role));
}

export function isSuperAdmin(session: Session | null | undefined): boolean {
  return hasAny(session, SUPERADMIN_ROLES);
}

export function hasRole(
  session: Session | null | undefined,
  role: string,
): boolean {
  return isSuperAdmin(session) || hasAny(session, [role]);
}

export function hasAnyRole(
  session: Session | null | undefined,
  roles: string[],
): boolean {
  return isSuperAdmin(session) || hasAny(session, roles);
}

// ── Enterprise area-aware helpers ──────────────────────────────────────────
//
// Pojedyncza funkcja `hasArea` zastępuje 24× canAccessXxx*. Korzysta z
// AREAS jako registry — dodanie nowego area lub roli automatycznie
// rozszerza dostęp bez touchowania admin-auth.ts.
//
// ┌─ hasArea(session, "documenso") ──── true gdy user ma JAKĄKOLWIEK rolę z area
// ├─ hasArea(session, "documenso", { min: 50 }) ─── true gdy minimum manager
// └─ getRoleInArea(session, "documenso") ───────── "admin"|"manager"|"member"|null
//
// Priorities z areas.ts: user=10, manager=50, admin=90.

interface HasAreaOpts {
  /** Wymagaj minimum priority (10/50/90). */
  min?: number;
}

/**
 * True gdy user ma którąkolwiek rolę z danego area (uwzględniając minimum
 * priority jeśli `opts.min` podane). Superadmin → zawsze true.
 */
export function hasArea(
  session: Session | null | undefined,
  areaId: string,
  opts: HasAreaOpts = {},
): boolean {
  if (isSuperAdmin(session)) return true;
  const area = AREAS.find((a) => a.id === areaId);
  if (!area) return false;
  const userRoles = new Set(rolesOf(session));
  const minPriority = opts.min ?? 0;
  // Match po seedach (area.kcRoles)
  for (const r of area.kcRoles) {
    if (r.priority >= minPriority && userRoles.has(r.name)) return true;
  }
  // Match po prefixie (dynamiczne role np. moodle_*) — dla area z dynamicRoles
  if (area.dynamicRoles) {
    const prefix = `${area.id.replace(/-/g, "_")}_`;
    for (const r of userRoles) {
      if (r.startsWith(prefix)) return true;
    }
  }
  return false;
}

/**
 * Zwraca nativeRoleId aktualnej (najwyższej priority) roli usera w area.
 * Null gdy user nie ma żadnej roli w obszarze.
 */
export function getRoleInArea(
  session: Session | null | undefined,
  areaId: string,
): { name: string; nativeRoleId: string | null; priority: number } | null {
  const area = AREAS.find((a) => a.id === areaId);
  if (!area) return null;
  const userRoles = new Set(rolesOf(session));
  let best: AreaRoleSeed | null = null;
  for (const r of area.kcRoles) {
    if (userRoles.has(r.name) && (!best || r.priority > best.priority)) {
      best = r;
    }
  }
  if (!best) return null;
  return {
    name: best.name,
    nativeRoleId: best.nativeRoleId ?? null,
    priority: best.priority,
  };
}

export function canAccessPanel(
  session: Session | null | undefined,
  panel: PanelKey,
): boolean {
  return hasRole(session, PANEL_ROLES[panel]);
}

/**
 * Centralna struktura "Co user może adminować".
 *
 * Source-of-truth: `AREAS` registry — każdy area deklaruje swoje role
 * z `priority`. Rola admin to ta z `priority >= 90`. Funkcja
 * `getAdminScopes()` derywuje z AREAS bez ręcznych list — dodanie nowego
 * area z admin role automatycznie wprowadza nową scope.
 *
 * Superadmin (KC realm-admin / manage-realm) ma wszystkie scope'y.
 */

export interface AdminScope {
  areaId: string;
  label: string;
  /** Realm role(s) jakie user posiada w tej area. */
  roleNames: string[];
}

const ADMIN_PRIORITY_THRESHOLD = 90;

export function getAdminScopes(
  session: Session | null | undefined,
): AdminScope[] {
  const userRoles = new Set(rolesOf(session));
  const sa = isSuperAdmin(session);
  const scopes: AdminScope[] = [];
  for (const area of AREAS) {
    const adminRoles = area.kcRoles.filter(
      (r) => r.priority >= ADMIN_PRIORITY_THRESHOLD,
    );
    if (adminRoles.length === 0) continue;
    if (sa) {
      scopes.push({
        areaId: area.id,
        label: area.label,
        roleNames: adminRoles.map((r) => r.name),
      });
      continue;
    }
    const owned = adminRoles.filter((r) => userRoles.has(r.name));
    if (owned.length > 0) {
      scopes.push({
        areaId: area.id,
        label: area.label,
        roleNames: owned.map((r) => r.name),
      });
    }
  }
  return scopes;
}

/** True dla każdego usera z którąkolwiek admin role (superadmin też). */
export function isAnyAdmin(
  session: Session | null | undefined,
): boolean {
  if (isSuperAdmin(session)) return true;
  return getAdminScopes(session).length > 0;
}

/** True gdy user może adminować konkretne area (id z AREAS). */
export function isAreaAdmin(
  session: Session | null | undefined,
  areaId: string,
): boolean {
  if (isSuperAdmin(session)) return true;
  return getAdminScopes(session).some((s) => s.areaId === areaId);
}

/**
 * "Dowolny panel admin" — true gdy user ma którąkolwiek admin role.
 * Implementacja używa `isAnyAdmin` derywujące z AREAS, więc dodanie
 * nowego area auto-rozszerza ten check.
 */
export function canAccessAdminPanel(
  session: Session | null | undefined,
): boolean {
  return isAnyAdmin(session);
}

// ── Per-area access checks (cienkie wrappery na hasArea) ──────────────────
// Wszystkie używają teraz `hasArea` z minimum priority — jedno źródło
// prawdy w AREAS registry. Dodanie nowej roli/area nie wymaga edycji
// admin-auth.ts.

export const canAccessInfrastructure = (s: Session | null | undefined) =>
  hasArea(s, "infrastructure", { min: 90 });

export const canAccessEmail = (s: Session | null | undefined) =>
  hasArea(s, "email-admin", { min: 90 });

/** @deprecated security panel zmergowany z infrastructure (2026-04-26). */
export const canAccessSecurity = canAccessInfrastructure;

export const canAccessDirectus = (s: Session | null | undefined) =>
  hasArea(s, "directus", { min: 90 });

// ─── Documenso — 3 tiery ──────────────────────────────────────────────────
export const canAccessDocumensoAsMember = (s: Session | null | undefined) =>
  hasArea(s, "documenso", { min: 10 });
export const canAccessDocumensoAsManager = (s: Session | null | undefined) =>
  hasArea(s, "documenso", { min: 50 });
export const canAccessDocumensoAsAdmin = (s: Session | null | undefined) =>
  hasArea(s, "documenso", { min: 90 });
/** @deprecated — zachowane dla kompatybilności callsite'ów. */
export const canAccessDocumensoAsUser = canAccessDocumensoAsMember;
/** @deprecated — handler = manager lub admin. */
export const canAccessDocumensoAsHandler = canAccessDocumensoAsManager;

// ─── Chatwoot ─────────────────────────────────────────────────────────────
export const canAccessChatwootAsAgent = (s: Session | null | undefined) =>
  hasArea(s, "chatwoot", { min: 10 });
export const canAccessChatwootAsAdmin = (s: Session | null | undefined) =>
  hasArea(s, "chatwoot", { min: 90 });

// ─── Postal — admin-only ──────────────────────────────────────────────────
export const canAccessPostal = (s: Session | null | undefined) =>
  hasArea(s, "postal", { min: 90 });

// ─── Moodle — dowolna rola z obszaru moodle daje dostęp ───────────────────
function moodleAreaRoles(): string[] {
  const area = AREAS.find((a) => a.id === "moodle");
  if (!area) return [];
  return area.kcRoles.map((r) => r.name);
}

// ─── Moodle — dynamiczne role (provider list + seed) ──────────────────────
// Area moodle ma `dynamicRoles=true` więc hasArea matchuje też role
// stworzone w Moodle UI (moodle_editingteacher itd.) przez prefix.
export const canAccessMoodleAsStudent = (s: Session | null | undefined) =>
  hasArea(s, "moodle", { min: 10 });

export function canAccessMoodleAsTeacher(
  session: Session | null | undefined,
): boolean {
  if (isSuperAdmin(session)) return true;
  const own = rolesOf(session);
  return own.some(
    (r) =>
      r === "moodle_manager" ||
      r === "moodle_editingteacher" ||
      r === "moodle_teacher" ||
      r === "moodle_coursecreator",
  );
}

export const canAccessMoodleAsAdmin = (s: Session | null | undefined) =>
  hasArea(s, "moodle", { min: 90 });

// ─── Knowledge / Outline — 3 tiery ────────────────────────────────────────
export const canAccessKnowledgeBase = (s: Session | null | undefined) =>
  hasArea(s, "knowledge", { min: 10 });
export const canAccessKnowledgeAsEditor = (s: Session | null | undefined) =>
  hasArea(s, "knowledge", { min: 50 });
export const canAccessKnowledgeAdmin = (s: Session | null | undefined) =>
  hasArea(s, "knowledge", { min: 90 });

// ─── Keycloak / step-ca / certs ───────────────────────────────────────────
export const canAccessKeycloakAdmin = (s: Session | null | undefined) =>
  hasArea(s, "keycloak", { min: 90 });
export const canAccessStepCa = (s: Session | null | undefined) =>
  hasArea(s, "stepca", { min: 90 });
export const canManageCertificates = (s: Session | null | undefined) =>
  hasArea(s, "certificates", { min: 90 });

export function canAccessKadromierz(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.KADROMIERZ_USER);
}

export function canAccessCalendar(
  session: Session | null | undefined,
): boolean {
  return !!session?.user;
}

function assertSession(
  session: Session | null | undefined,
): asserts session is Session & { accessToken: string } {
  if (!session || !(session as Session & { accessToken?: string }).accessToken) {
    throw ApiError.unauthorized();
  }
}

export function requireAdminPanel(
  session: Session | null | undefined,
): asserts session is Session & { accessToken: string } {
  assertSession(session);
  if (!canAccessAdminPanel(session)) {
    throw ApiError.forbidden("Missing admin role");
  }
}

export function requireInfrastructure(
  session: Session | null | undefined,
): asserts session is Session & { accessToken: string } {
  assertSession(session);
  if (!canAccessInfrastructure(session)) {
    throw ApiError.forbidden("Missing role: infrastructure_admin");
  }
}

export function requireEmail(
  session: Session | null | undefined,
): asserts session is Session & { accessToken: string } {
  assertSession(session);
  if (!canAccessEmail(session)) {
    throw ApiError.forbidden("Missing role: email_admin");
  }
}

/**
 * @deprecated security panel został zmergowany z infrastructure — używa
 * teraz `infrastructure_admin`. Eksport zachowany dla backward-compat
 * istniejących handlerów (nie alias-const, bo TS asserts wymaga pełnej
 * deklaracji funkcji).
 */
export function requireSecurity(
  session: Session | null | undefined,
): asserts session is Session & { accessToken: string } {
  requireInfrastructure(session);
}

export function requireCertificates(
  session: Session | null | undefined,
): asserts session is Session & { accessToken: string } {
  assertSession(session);
  if (!canManageCertificates(session)) {
    throw ApiError.forbidden("Missing role: certificates_admin");
  }
}

/**
 * Single-role-per-area guard — używane przez API walidatory + UI.
 */
export function assertSingleRolePerArea(roleNames: readonly string[]): void {
  const byArea = new Map<string, string[]>();
  for (const name of roleNames) {
    const area = findAreaForRole(name);
    if (!area) continue;
    const bucket = byArea.get(area.id) ?? [];
    bucket.push(name);
    byArea.set(area.id, bucket);
  }
  const violations: Array<{ areaId: string; roles: string[] }> = [];
  for (const [areaId, roles] of byArea) {
    if (roles.length > 1) violations.push({ areaId, roles });
  }
  if (violations.length > 0) {
    const msg = violations
      .map((v) => `${v.areaId}: ${v.roles.join(", ")}`)
      .join("; ");
    throw ApiError.badRequest(`Single-role-per-area violated — ${msg}`);
  }
}

/**
 * Zwraca listę wszystkich zarejestrowanych realm ról z AREAS registry.
 * Używane przez middleware do generowania ROLE_GUARDS.
 */
export function getAllAreaRoleNames(): string[] {
  const names = new Set<string>();
  for (const area of AREAS) {
    for (const r of area.kcRoles) names.add(r.name);
  }
  return Array.from(names);
}

/** Moodle role names — wrapowane tak, żeby dynamiczne role (spoza seeda)
 * też liczyły się jako "dowolna rola w Moodle" dla dostępu do tile'a.
 * Eksport używany przez middleware (moodle/events/status APIs). */
export function getMoodleRoleNames(): string[] {
  return moodleAreaRoles();
}
