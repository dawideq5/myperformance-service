/**
 * Single source of truth dla realm roles które dają superadmin = full access.
 * Wcześniej lista była w 3 miejscach (admin-auth.ts, access-client.ts,
 * middleware.ts) — synchronizacja ręczna była podatna na rozjazd.
 *
 * Każdy z tych roles daje TOTAL bypass area-checks. Importuj zarówno
 * server-side (admin-auth, middleware) jak i client-side (access-client).
 */

export const SUPERADMIN_ROLES: readonly string[] = [
  "realm-admin",
  "manage-realm",
  "admin",
];

export const SUPERADMIN_ROLES_SET: ReadonlySet<string> = new Set(
  SUPERADMIN_ROLES,
);

export function hasSuperadminRole(roles: readonly string[]): boolean {
  for (const r of roles) {
    if (SUPERADMIN_ROLES_SET.has(r)) return true;
  }
  return false;
}
