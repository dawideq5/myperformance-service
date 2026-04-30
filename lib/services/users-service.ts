// Pure helpers extracted from app/admin/users/UsersClient.tsx during faza-3.
// Stateless functions only — no React, no I/O, no DOM.

import type {
  AdminIntegrationStatus,
  AdminUserSummary,
} from "@/app/account/account-service";

// ── Stałe ────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 25;
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const PRESENCE_POLL_MS = 60 * 1000;

// ── Type aliases (presence/integrations/lock map) ────────────────────────

export type PresenceMap = Record<string, number>;
export type IntegrationsMap = Record<string, AdminIntegrationStatus>;
export type LockMap = Record<
  string,
  { numFailures: number; disabled: boolean; lastFailure: number | null }
>;

// ── Formatowanie ─────────────────────────────────────────────────────────

/**
 * Format Keycloak timestamp (sekundy lub milisekundy) jako PL date-time.
 * Heurystycznie wykrywa unit po wielkości liczby — KC zwraca sekundy dla
 * `createdTimestamp`, ale `lastAccess` w sessions czasem ms. > 1e11 = ms.
 */
export function formatDate(ts: number | null): string {
  if (!ts) return "—";
  const ms = ts > 100_000_000_000 ? ts : ts * 1000;
  return new Date(ms).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Imię + nazwisko, fallback do username gdy oba puste. */
export function fullName(u: AdminUserSummary): string {
  return (
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username
  );
}

// ── Pagination math ──────────────────────────────────────────────────────

export interface PageInfo {
  start: number;
  end: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function computePages(
  first: number,
  total: number,
  pageSize: number = PAGE_SIZE,
): PageInfo {
  return {
    start: total > 0 ? first + 1 : 0,
    end: Math.min(first + pageSize, total),
    total,
    hasPrev: first > 0,
    hasNext: first + pageSize < total,
  };
}

// ── Presence ────────────────────────────────────────────────────────────

/** User jest "online" jeśli ostatnia aktywność (s) była mniej niż 5 min temu. */
export function isOnline(presence: number | undefined): boolean {
  if (!presence) return false;
  return Date.now() - presence * 1000 < ONLINE_WINDOW_MS;
}

// ── Lock status ─────────────────────────────────────────────────────────

export interface LockSummary {
  locked: boolean;
  numFailures: number;
  disabledByLock: boolean;
}

export function summarizeLock(
  lock: LockMap[string] | undefined,
): LockSummary {
  if (!lock) return { locked: false, numFailures: 0, disabledByLock: false };
  return {
    locked: lock.disabled || lock.numFailures > 0,
    numFailures: lock.numFailures,
    disabledByLock: lock.disabled,
  };
}

// ── Bulk operation validators ───────────────────────────────────────────

/**
 * Walidator bulk-assign: wymaga wybranej grupy + co najmniej 1 usera.
 * Zwraca string z komunikatem błędu, albo null gdy OK.
 */
export function validateBulkGroupAssign(
  groupId: string,
  userIds: string[],
): string | null {
  if (!groupId.trim()) return "Wybierz grupę";
  if (userIds.length === 0) return "Brak zaznaczonych użytkowników";
  return null;
}

// ── Selection helpers ───────────────────────────────────────────────────

/** Zaznacz/odznacz wszystkich userów na stronie. */
export function toggleAllSelection(
  current: Set<string>,
  pageUserIds: string[],
): Set<string> {
  const allSel = pageUserIds.every((i) => current.has(i));
  const next = new Set(current);
  if (allSel) for (const i of pageUserIds) next.delete(i);
  else for (const i of pageUserIds) next.add(i);
  return next;
}

export function toggleSelection(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
