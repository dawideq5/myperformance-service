import type { Session } from "next-auth";
import { ApiError } from "@/lib/api-utils";

/**
 * Realm role catalog. Roles tagged `default: true` belong to
 * `default-roles-myperformance` and are granted to every authenticated user.
 * Roles tagged `default: false` are gated and must be assigned manually
 * via the Keycloak admin UI (or the dedicated Keycloakify interface).
 */
export const ROLES = {
  APP_USER: "app_user",
  MANAGE_USERS: "manage_users",
  DIRECTUS_ACCESS: "directus_access",
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export interface RoleSpec {
  name: AppRole;
  description: string;
  default: boolean;
}

export const ROLE_CATALOG: RoleSpec[] = [
  {
    name: ROLES.APP_USER,
    description: "Default role for authenticated users - grants access to dashboard",
    default: true,
  },
  {
    name: ROLES.MANAGE_USERS,
    description: "Zarządzanie kontami użytkowników realmu Keycloak",
    default: false,
  },
  {
    name: ROLES.DIRECTUS_ACCESS,
    description: "Dostęp do Directus CMS",
    default: false,
  },
];

/**
 * Keycloak realm-management roles that implicitly grant full admin —
 * we honour them so realm-admin users work out of the box.
 */
const SUPERADMIN_ROLES = ["realm-admin", "manage-realm", "manage-users", "admin"];

export const PANEL_ROLES = {
  sprzedawca: "sprzedawca",
  serwisant: "serwisant",
  kierowca: "kierowca",
  dokumenty: "dokumenty_access",
} as const;

export type PanelKey = keyof typeof PANEL_ROLES;

export function canAccessPanel(
  session: Session | null | undefined,
  panel: PanelKey,
): boolean {
  return isSuperAdmin(session) || hasAny(session, [PANEL_ROLES[panel]]);
}

function rolesOf(session: Session | null | undefined): string[] {
  return session?.user?.roles ?? [];
}

function hasAny(session: Session | null | undefined, roles: string[]): boolean {
  const ownRoles = rolesOf(session);
  if (!ownRoles.length) return false;
  return roles.some((role) => ownRoles.includes(role));
}

export function isSuperAdmin(session: Session | null | undefined): boolean {
  return hasAny(session, SUPERADMIN_ROLES);
}

/**
 * Gate for the in-app /admin/users panel. Granted to:
 *   - realm-management super-admins,
 *   - users with the `manage_users` role.
 */
export function canAccessAdminPanel(
  session: Session | null | undefined,
): boolean {
  return isSuperAdmin(session) || hasAny(session, [ROLES.MANAGE_USERS]);
}

/**
 * Whether the user should see the Directus tile / be allowed to SSO into the CMS.
 * Granted to admins, directus-admin, and directus_editor.
 */
export function canAccessDirectus(
  session: Session | null | undefined,
): boolean {
  return isSuperAdmin(session) || hasAny(session, [ROLES.DIRECTUS_ACCESS]);
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
