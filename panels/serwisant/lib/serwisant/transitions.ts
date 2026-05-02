import type { ServiceStatus } from "./status-meta";

/**
 * Lokalna kopia macierzy tranzycji statusów (root `lib/services.ts`).
 * Source of truth pozostaje w root — backend egzekwuje walidację po stronie API.
 * Tu duplikujemy tylko żeby UI mógł filtrować dostępne cele bez round-tripu.
 *
 * Jeśli root rozszerzy listę przejść, panel ZACZNIE blokować nowe targety w UI,
 * ale sam backend zaakceptuje je — nie powstaje stan niespójny, tylko
 * tymczasowo zubożone UI do czasu sync'u tej kopii.
 */
export type ServiceTransitionRole = "service" | "sales";

const STATUS_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  received: [
    "diagnosing",
    "awaiting_quote",
    "awaiting_parts",
    "repairing",
    "on_hold",
    "rejected_by_customer",
    "returned_no_repair",
    "cancelled",
    "archived",
  ],
  diagnosing: [
    "awaiting_quote",
    "awaiting_parts",
    "repairing",
    "on_hold",
    "rejected_by_customer",
    "returned_no_repair",
    "cancelled",
    "archived",
  ],
  awaiting_quote: [
    "awaiting_parts",
    "repairing",
    "on_hold",
    "rejected_by_customer",
    "returned_no_repair",
    "cancelled",
    "archived",
  ],
  awaiting_parts: [
    "repairing",
    "on_hold",
    "rejected_by_customer",
    "returned_no_repair",
    "cancelled",
    "archived",
  ],
  repairing: [
    "awaiting_parts",
    "testing",
    "on_hold",
    "rejected_by_customer",
    "returned_no_repair",
    "cancelled",
    "archived",
  ],
  testing: ["ready", "repairing", "on_hold", "cancelled", "archived"],
  ready: ["delivered", "closed", "archived"],
  delivered: ["closed", "archived"],
  on_hold: [
    "received",
    "diagnosing",
    "awaiting_quote",
    "awaiting_parts",
    "repairing",
    "testing",
    "ready",
    "cancelled",
    "archived",
  ],
  rejected_by_customer: ["returned_no_repair", "closed", "archived"],
  returned_no_repair: ["closed", "archived"],
  closed: [],
  cancelled: ["archived"],
  archived: [],
};

const SALES_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  received: [],
  diagnosing: [],
  awaiting_quote: [],
  awaiting_parts: [],
  repairing: [],
  testing: [],
  ready: ["delivered"],
  delivered: ["closed"],
  on_hold: [],
  rejected_by_customer: [],
  returned_no_repair: [],
  closed: [],
  cancelled: [],
  archived: [],
};

export function getAllowedTargets(
  from: ServiceStatus,
  role: ServiceTransitionRole = "service",
): ServiceStatus[] {
  const matrix = role === "sales" ? SALES_TRANSITIONS : STATUS_TRANSITIONS;
  return matrix[from] ?? [];
}

export function canTransition(
  from: ServiceStatus,
  to: ServiceStatus,
  role: ServiceTransitionRole = "service",
): boolean {
  if (from === to) return true;
  return getAllowedTargets(from, role).includes(to);
}

/** Czy status wymaga podania holdReason przy tranzycji do niego. */
export function requiresHoldReason(to: ServiceStatus): boolean {
  return to === "on_hold";
}

/** Czy status wymaga podania cancellationReason przy tranzycji do niego. */
export function requiresCancellationReason(to: ServiceStatus): boolean {
  return (
    to === "rejected_by_customer" ||
    to === "returned_no_repair" ||
    to === "cancelled" ||
    to === "closed"
  );
}
