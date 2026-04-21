import type { Session } from "next-auth";
import { ApiError } from "@/lib/api-utils";

/**
 * Realm-wide role catalog.
 *
 * Shape: `<service>_user` grants read/basic use, `<service>_admin` grants
 * elevated/management rights. Niektóre usługi (Directus, Listmonk, step-ca)
 * są admin-only — nie mają odpowiednika `_user`.
 *
 * Roles with `default: true` belong to `default-roles-myperformance` and
 * are auto-granted to every authenticated user. Everything else is gated
 * and must be assigned explicitly via the `/admin/users` console.
 */
export const ROLES = {
  APP_USER: "app_user",

  // Calendar (Google)
  CALENDAR_USER: "calendar_user",

  // Konto / self-service (always granted; every authed user has it)
  ACCOUNT_USER: "account_user",

  // Management consoles
  MANAGE_USERS: "manage_users",

  // Client certs (/admin/certificates)
  CERTIFICATES_ADMIN: "certificates_admin",

  // Kadromierz
  KADROMIERZ_USER: "kadromierz_user",

  // Directus CMS (admin-only)
  DIRECTUS_ADMIN: "directus_admin",

  // Documenso: user = własne dokumenty, admin = konsola Documenso
  DOCUMENSO_USER: "documenso_user",
  DOCUMENSO_ADMIN: "documenso_admin",

  // Chatwoot: agent = obsługa klienta, admin = konfiguracja
  CHATWOOT_AGENT: "chatwoot_agent",
  CHATWOOT_ADMIN: "chatwoot_admin",

  // Listmonk / Usesend (email platform) — admin-only
  USESEND_ADMIN: "usesend_admin",

  // Keycloak (admin console)
  KEYCLOAK_ADMIN: "keycloak_admin",

  // Step CA — admin-only (panel diagnostyczny + self-service cert)
  STEPCA_ADMIN: "stepca_admin",
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
  { name: ROLES.ACCOUNT_USER, description: "Samoobsługa konta (2FA, WebAuthn, integracje) — domyślnie dla wszystkich", default: true },

  { name: ROLES.CALENDAR_USER, description: "Kalendarz Google w dashboardzie", default: true },

  { name: ROLES.MANAGE_USERS, description: "Zarządzanie kontami użytkowników w panelu /admin/users", default: false },
  { name: ROLES.CERTIFICATES_ADMIN, description: "Wydawanie i odwoływanie certyfikatów klienckich (step-ca)", default: false },
  { name: ROLES.KADROMIERZ_USER, description: "Integracja Kadromierz (grafik, ewidencja czasu)", default: true },

  { name: ROLES.DIRECTUS_ADMIN, description: "Administrator Directus CMS", default: false },

  { name: ROLES.DOCUMENSO_USER, description: "Zalogowanie do Documenso jako zwykły użytkownik (własne dokumenty)", default: false },
  { name: ROLES.DOCUMENSO_ADMIN, description: "Administrator Documenso (szablony, webhooki, użytkownicy)", default: false },

  { name: ROLES.CHATWOOT_AGENT, description: "Agent obsługi klienta w Chatwoot", default: false },
  { name: ROLES.CHATWOOT_ADMIN, description: "Administrator Chatwoot (konfiguracja, użytkownicy, webhooki)", default: false },

  { name: ROLES.USESEND_ADMIN, description: "Administrator platformy e-mail (Listmonk / Usesend)", default: false },

  { name: ROLES.KEYCLOAK_ADMIN, description: "Konsola administracyjna Keycloak", default: false },

  { name: ROLES.STEPCA_ADMIN, description: "Administrator step-ca (provisionery, polityki, self-service cert)", default: false },
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

export const PANEL_ADMIN_ROLES: Record<PanelKey, string> = {
  sprzedawca: "sprzedawca_admin",
  serwisant: "serwisant_admin",
  kierowca: "kierowca_admin",
};

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
  return hasAnyRole(session, [PANEL_ROLES[panel], PANEL_ADMIN_ROLES[panel]]);
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

export function canAccessUsesend(
  session: Session | null | undefined,
): boolean {
  return hasRole(session, ROLES.USESEND_ADMIN);
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
  return hasRole(session, ROLES.CALENDAR_USER);
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
