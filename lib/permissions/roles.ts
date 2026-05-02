/**
 * Wave 20 / Faza 1G — Role-based action permissions dla panelu serwisanta.
 *
 * Te helpery odpowiadają na pytanie "co user może zrobić w detail view"
 * (edycja klienta, zmiana typu naprawy, usuwanie zleceń, override cen
 * po wystawieniu aneksu, status `cancelled`/`rejected_by_customer`).
 *
 * Source-of-truth pozostaje `lib/permissions/areas.ts` (AREAS registry)
 * i `lib/admin-auth.ts` (`isSuperAdmin`, `isAreaAdmin`). Tutaj składamy
 * proste predykaty z listy KC realm-roles usera — kompatybilne zarówno
 * z dashboardem (NextAuth Session) jak i panelem-serwisantem (string[]
 * z access-token claim).
 *
 * ### Model ról (Wave 19/20)
 *
 *   - `serwisant`            — base role: dostęp do panelu serwisanta
 *   - `service_admin`        — full edit/delete/override w panelu serwisanta
 *   - SUPERADMIN_ROLES (KC)  — realm-management role → zawsze pełen dostęp
 *
 * Nazwa `service_admin` jest świadomie inna niż istniejąca area `directus`
 * lub `panel-serwisant` — to enterprise-rola **operacyjna** dla zarządzania
 * danymi zleceń (poza KC IAM). Jeśli AREAS nie zawiera jeszcze tej roli,
 * canEditServiceData zwraca true tylko dla superadminów / `admin`.
 *
 * ### API
 *
 *   - canEditServiceData(roles)        — KlientTab edit, edit photo captions
 *   - canChangeRepairType(roles)       — zmiana typu naprawy w nagłówku
 *   - canDeleteService(roles)          — DELETE /services/:id
 *   - canDeleteAnnex(roles)            — DELETE annex/component
 *   - canOverridePriceAfterAnnex(roles)— edycja ceny po wystawieniu aneksu
 *   - canSetTerminalStatus(roles)      — `cancelled`, `rejected_by_customer`
 *   - canManageInternalNotes(roles)    — usuwanie cudzych notatek (autor zawsze)
 *
 * Użycie:
 * ```ts
 * import { canEditServiceData } from "@/lib/permissions/roles";
 * const allowed = canEditServiceData(session.user.roles ?? []);
 * ```
 */

import { SUPERADMIN_ROLES } from "@/lib/permissions/superadmin";

/**
 * Realm-role names które dają write/delete dostęp do danych zleceń.
 * `service_admin` to docelowa rola Wave 20 (forward-compat — może być
 * jeszcze nie utworzona w realmie). SUPERADMIN_ROLES już obejmują `admin`
 * + `realm-admin` + `manage-realm`, więc nie powtarzamy aliasów.
 */
export const SERVICE_ADMIN_ROLES: readonly string[] = [
  "service_admin",
  ...SUPERADMIN_ROLES,
];

export interface PermissionContext {
  roles: readonly string[];
}

function hasAny(roles: readonly string[], allowed: readonly string[]): boolean {
  if (!roles || roles.length === 0) return false;
  for (const r of roles) {
    if (allowed.includes(r)) return true;
  }
  return false;
}

/** True jeśli user ma jakąkolwiek rolę super-admina (KC realm-management). */
export function isServiceSuperadmin(roles: readonly string[]): boolean {
  return hasAny(roles, SUPERADMIN_ROLES);
}

/** True jeśli user może edytować dane usługi (klient, urządzenie, opis). */
export function canEditServiceData(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

/** True jeśli user może zmienić typ naprawy. */
export function canChangeRepairType(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

/** True jeśli user może usunąć zlecenie (hard delete). */
export function canDeleteService(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

/** True jeśli user może usunąć aneks lub komponent z aneksu. */
export function canDeleteAnnex(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

/** True jeśli user może edytować cenę po wystawieniu aneksu (override). */
export function canOverridePriceAfterAnnex(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

/**
 * True jeśli user może zmienić status na "anulowane" / "odrzucone przez
 * klienta" — terminalny status z konsekwencjami biznesowymi (refund,
 * archiwizacja). Pozostałe transitions są dostępne dla każdego serwisanta.
 */
export function canSetTerminalStatus(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

/**
 * True jeśli user może administrować internal notes (usuwać cudze, pinować).
 * Autor zawsze może usunąć/edytować swoją notatkę — to sprawdza komponent
 * sam (porównanie email).
 */
export function canManageInternalNotes(roles: readonly string[]): boolean {
  return hasAny(roles, SERVICE_ADMIN_ROLES);
}

/**
 * Spakowany flag-set do propagacji przez context provider — UI używa
 * boolean fields zamiast wywoływać wszystkie funkcje per render.
 */
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

/**
 * Server-side guard helper — używane przez API endpointy które wymagają
 * service_admin. Throwuje ApiError.forbidden gdy brak roli.
 *
 * Uwaga: nie importujemy ApiError tutaj żeby `lib/permissions/roles.ts`
 * był zero-deps poza `superadmin`. Caller dostaje `{ ok, reason }` i sam
 * decyduje jak zwrócić 403.
 */
export function ensureServiceAdmin(
  roles: readonly string[],
): { ok: true } | { ok: false; reason: string } {
  if (canEditServiceData(roles)) return { ok: true };
  return {
    ok: false,
    reason: "Wymagana rola service_admin / admin (Wave 20 RBAC).",
  };
}
