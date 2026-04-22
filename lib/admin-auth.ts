import type { Session } from "next-auth";
import { ApiError } from "@/lib/api-utils";
import { AREAS, findAreaForRole } from "@/lib/permissions/areas";

/**
 * Realm-wide role catalog.
 *
 * Shape: `<service>_user` grants read/basic use, `<service>_admin` grants
 * elevated/management rights. Niektóre usługi (Directus, Postal, step-ca)
 * są admin-only — nie mają odpowiednika `_user`.
 *
 * Roles with `default: true` belong to `default-roles-myperformance` and
 * are auto-granted to every authenticated user. Everything else is gated
 * and must be assigned explicitly via the `/admin/users` console.
 */
export const ROLES = {
  APP_USER: "app_user",

  // Management consoles
  MANAGE_USERS: "manage_users",

  // Client certs (/admin/certificates)
  CERTIFICATES_ADMIN: "certificates_admin",

  // Kadromierz
  KADROMIERZ_USER: "kadromierz_user",

  // Directus CMS (admin-only)
  DIRECTUS_ADMIN: "directus_admin",

  // Documenso:
  //   user    = pracownik; widzi własne dokumenty, podpisuje je
  //   handler = obsługa dokumentów (księgowa); wysyła + śledzi obieg całej org
  //   admin   = konsola Documenso (szablony, webhooki, użytkownicy)
  DOCUMENSO_USER: "documenso_user",
  DOCUMENSO_HANDLER: "documenso_handler",
  DOCUMENSO_ADMIN: "documenso_admin",

  // Chatwoot: agent = obsługa klienta, administrator = konfiguracja
  CHATWOOT_AGENT: "chatwoot_agent",
  CHATWOOT_ADMIN: "chatwoot_administrator",

  // Postal (transactional + newsletter sender) — admin-only
  POSTAL_ADMIN: "postal_admin",

  // Keycloak (admin console)
  KEYCLOAK_ADMIN: "keycloak_admin",

  // Step CA — admin-only (panel diagnostyczny + self-service cert)
  STEPCA_ADMIN: "stepca_admin",

  // Moodle (LMS — szkolenia wewnętrzne) — nazwy mapowane 1:1 na Moodle shortnames.
  MOODLE_STUDENT: "moodle_student",
  MOODLE_TEACHER: "moodle_editingteacher",
  MOODLE_ADMIN: "moodle_manager",

  // Knowledge base (Outline wiki — procedury, zasady)
  KNOWLEDGE_USER: "knowledge_user",
  KNOWLEDGE_ADMIN: "knowledge_admin",
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
  { name: ROLES.CERTIFICATES_ADMIN, description: "Wydawanie i odwoływanie certyfikatów klienckich (step-ca)", default: false },
  { name: ROLES.KADROMIERZ_USER, description: "Integracja Kadromierz (grafik, ewidencja czasu)", default: true },

  { name: ROLES.DIRECTUS_ADMIN, description: "Administrator Directus CMS", default: false },

  { name: ROLES.DOCUMENSO_USER, description: "Zalogowanie do Documenso jako zwykły użytkownik (własne dokumenty)", default: false },
  { name: ROLES.DOCUMENSO_HANDLER, description: "Obsługa dokumentów (księgowa): wysyłanie + zarządzanie obiegiem dokumentów całej organizacji", default: false },
  { name: ROLES.DOCUMENSO_ADMIN, description: "Administrator Documenso (szablony, webhooki, użytkownicy)", default: false },

  { name: ROLES.CHATWOOT_AGENT, description: "Agent obsługi klienta w Chatwoot", default: false },
  { name: ROLES.CHATWOOT_ADMIN, description: "Administrator Chatwoot (konfiguracja, użytkownicy, webhooki)", default: false },

  { name: ROLES.POSTAL_ADMIN, description: "Administrator platformy e-mail (Postal)", default: false },

  { name: ROLES.KEYCLOAK_ADMIN, description: "Konsola administracyjna Keycloak", default: false },

  { name: ROLES.STEPCA_ADMIN, description: "Administrator step-ca (provisionery, polityki, self-service cert)", default: false },

  { name: ROLES.MOODLE_STUDENT, description: "Moodle: uczeń (kursy, szkolenia przypisane do konta)", default: false },
  { name: ROLES.MOODLE_TEACHER, description: "Moodle: editing teacher (tworzenie kursów, ocenianie, raporty)", default: false },
  { name: ROLES.MOODLE_ADMIN, description: "Moodle: manager (konfiguracja instancji, użytkownicy, pluginy)", default: false },

  { name: ROLES.KNOWLEDGE_USER, description: "Baza wiedzy (Outline): czytanie i tworzenie artykułów procedur i zasad", default: true },
  { name: ROLES.KNOWLEDGE_ADMIN, description: "Baza wiedzy (Outline): administrator (kolekcje, użytkownicy, integracje)", default: false },
];

/**
 * Keycloak realm-management roles that implicitly grant full admin — we
 * honour them so that realm-admin users work out of the box without
 * needing every bespoke role assigned manually.
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

export function canAccessPanel(
  session: Session | null | undefined,
  panel: PanelKey,
): boolean {
  return hasRole(session, PANEL_ROLES[panel]);
}

export function canAccessAdminPanel(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.MANAGE_USERS);
}

export function canAccessDirectus(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.DIRECTUS_ADMIN);
}

export function canAccessDocumensoAsUser(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.DOCUMENSO_USER);
}

export function canAccessDocumensoAsHandler(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.DOCUMENSO_HANDLER);
}

export function canAccessDocumensoAsAdmin(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.DOCUMENSO_ADMIN);
}

export function canAccessChatwootAsAgent(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.CHATWOOT_AGENT);
}

export function canAccessChatwootAsAdmin(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.CHATWOOT_ADMIN);
}

export function canAccessPostal(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.POSTAL_ADMIN);
}

export function canAccessMoodleAsStudent(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.MOODLE_STUDENT);
}

export function canAccessMoodleAsTeacher(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.MOODLE_TEACHER);
}

export function canAccessMoodleAsAdmin(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.MOODLE_ADMIN);
}

export function canAccessKnowledgeBase(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.KNOWLEDGE_USER);
}

export function canAccessKnowledgeAdmin(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.KNOWLEDGE_ADMIN);
}

export function canAccessKeycloakAdmin(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.KEYCLOAK_ADMIN);
}

export function canAccessStepCa(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.STEPCA_ADMIN);
}

export function canManageCertificates(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.CERTIFICATES_ADMIN);
}

export function canAccessKadromierz(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.KADROMIERZ_USER);
}

export function canAccessCalendar(
  session: Session | null | undefined,
): boolean {
  // Kalendarz jest częścią bazowego doświadczenia dashboardu —
  // dostęp ma każdy uwierzytelniony użytkownik.
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
    throw ApiError.forbidden("Missing role: manage_users");
  }
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
 * Sprawdza, czy zbiór ról zawiera >1 rolę w ramach tego samego area.
 * Single-role-per-area: użytkownik może mieć maksymalnie jedną rolę
 * w każdym obszarze. Używane przez UI + API walidatory.
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
