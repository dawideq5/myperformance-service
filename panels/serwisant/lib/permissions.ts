/**
 * Wave 20 / Faza 1G — Panel-side mirror of `lib/permissions/roles.ts`.
 *
 * Panel-serwisant jest osobnym Next.js app-em (różny `@/*` alias) — nie
 * możemy importować z dashboardu, musimy zduplikować logikę. Trzymamy
 * 1:1 tę samą listę ról + helpers żeby UI i backend były spójne.
 *
 * SoT: dashboard `lib/permissions/roles.ts` + `lib/permissions/superadmin.ts`.
 * Synchronizacja: ręczna — gdy zmienia się lista SUPERADMIN_ROLES albo
 * SERVICE_ADMIN_ROLES tutaj też trzeba uaktualnić. Naruszenie spójności
 * → user widzi przycisk Edytuj który backend odrzuci 403 (fail-safe).
 */

const SUPERADMIN_ROLES = ["realm-admin", "manage-realm", "admin"] as const;

export const SERVICE_ADMIN_ROLES: readonly string[] = [
  "service_admin",
  ...SUPERADMIN_ROLES,
];

function hasAny(
  roles: readonly string[],
  allowed: readonly string[],
): boolean {
  if (!roles || roles.length === 0) return false;
  for (const r of roles) {
    if (allowed.includes(r)) return true;
  }
  return false;
}

export function isServiceSuperadmin(roles: readonly string[]): boolean {
  return hasAny(roles, SUPERADMIN_ROLES);
}

export function canEditServiceData(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

export function canChangeRepairType(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

export function canDeleteService(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

export function canDeleteAnnex(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

export function canOverridePriceAfterAnnex(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

export function canSetTerminalStatus(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

export function canManageInternalNotes(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

export interface ServiceActionPermissions {
  canEditServiceData: boolean;
  canChangeRepairType: boolean;
  canDeleteService: boolean;
  canDeleteAnnex: boolean;
  canOverridePriceAfterAnnex: boolean;
  canSetTerminalStatus: boolean;
  canManageInternalNotes: boolean;
}

export function computeServiceActionPermissions(
  roles: readonly string[],
): ServiceActionPermissions {
  return {
    canEditServiceData: canEditServiceData(roles),
    canChangeRepairType: canChangeRepairType(roles),
    canDeleteService: canDeleteService(roles),
    canDeleteAnnex: canDeleteAnnex(roles),
    canOverridePriceAfterAnnex: canOverridePriceAfterAnnex(roles),
    canSetTerminalStatus: canSetTerminalStatus(roles),
    canManageInternalNotes: canManageInternalNotes(roles),
  };
}
