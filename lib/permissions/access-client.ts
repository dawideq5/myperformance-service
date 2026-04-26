"use client";

import { AREAS } from "./areas";
import { SUPERADMIN_ROLES } from "./superadmin";

/**
 * Sprawdza czy user ma dostęp do area na podstawie listy realm roles
 * (z `session.user.roles`). Pure-client function — bez fetch, bez
 * external state. Używana w OnboardingCard + tour.ts + komponentach
 * filtrujących UI po roli.
 */
export function userHasAreaClient(
  roles: string[],
  areaId: string,
  minPriority = 1,
): boolean {
  if (roles.some((r) => SUPERADMIN_ROLES.includes(r))) return true;
  const area = AREAS.find((a) => a.id === areaId);
  if (!area) return false;
  const userRoleSet = new Set(roles);
  for (const r of area.kcRoles) {
    if (r.priority >= minPriority && userRoleSet.has(r.name)) return true;
  }
  if (area.dynamicRoles) {
    const prefix = `${area.id.replace(/-/g, "_")}_`;
    for (const r of roles) {
      if (r.startsWith(prefix)) return true;
    }
  }
  return false;
}

export function isSuperAdminClient(roles: string[]): boolean {
  return roles.some((r) => SUPERADMIN_ROLES.includes(r));
}
