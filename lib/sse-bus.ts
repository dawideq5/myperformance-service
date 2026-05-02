/**
 * In-memory SSE event bus (Wave 19/Phase 1D).
 *
 * Single-process pub/sub used przez `/api/events` SSE endpoint do real-time
 * push do paneli (sprzedawca/serwisant/kierowca). Zastępuje polling
 * `/api/relay/services/[id]` co kilka sekund.
 *
 * Architektura
 * ────────────
 *  - Każdy connect SSE rejestruje subscriber callback w `subscribers` Set.
 *  - Każda mutacja (logServiceAction, updateService, createServiceAnnex,
 *    photo upload, internal-note insert, webhook documenso/chatwoot)
 *    wywołuje `publish()` synchronicznie po zapisie do bazy.
 *  - Subscribers filtrują po `serviceId` lub `userEmail` po stronie endpointa.
 *
 * UWAGA — single VPS / Coolify: Bus żyje w jednym procesie Node. Skalowanie
 * horyzontalne wymaga Redis pub/sub (intentionally pominięte w Phase 1D).
 * Interface jest minimalny żeby łatwo wymienić warstwę transportu.
 *
 * Memory safety: cap 1024 subscribers (defensive — DoS guard). publish() jest
 * sync; każdy subscriber w try/catch żeby jedna padnięta connection nie
 * łamała broadcastu pozostałym.
 */

import { randomUUID } from "node:crypto";
import { log } from "@/lib/logger";

const logger = log.child({ module: "sse-bus" });

const MAX_SUBSCRIBERS = 1024;

/**
 * Typy eventów emitowanych w systemie. Lista zamknięta — dodawanie nowych
 * wymaga update również po stronie klientów (panels/*).
 */
export type SseEventType =
  | "action_logged"
  | "status_changed"
  | "service_updated"
  | "annex_created"
  | "annex_accepted"
  | "annex_rejected"
  | "annex_completed"
  | "photo_uploaded"
  | "photo_deleted"
  | "internal_note_added"
  | "internal_note_deleted"
  | "internal_note_pinned"
  | "internal_note_unpinned"
  | "chat_message_received"
  | "customer_message_sent"
  | "transport_job_created"
  | "transport_job_updated"
  | "component_added"
  | "component_updated"
  | "component_deleted"
  | "document_created"
  | "document_updated"
  | "document_deleted"
  // Wave 21 / Faza 1C — wydanie urządzenia (po weryfikacji 6-cyfrowego kodu).
  | "released"
  | "release_code_sent"
  // Wave 21 / Faza 1D — notatka o kontakcie z klientem (off-channel,
  // telefon / osobiście) dodana przez pracownika.
  | "customer_contact_recorded";

export interface SseEvent {
  /** Random UUID — używane przez klientów do dedup. */
  id: string;
  type: SseEventType;
  /** Powiązany service (gdy istnieje). null dla user-scoped notyfikacji. */
  serviceId: string | null;
  /** Email odbiorcy (gdy event jest skierowany do konkretnego usera). */
  userEmail?: string | null;
  /** Wolny payload — zwykle minimal id/ref do refetchu po stronie klienta. */
  payload: Record<string, unknown>;
  /** ISO timestamp. */
  ts: string;
}

export type SseSubscriber = (event: SseEvent) => void;

const subscribers = new Set<SseSubscriber>();

/**
 * Zarejestruj nowy subscriber. Zwraca unsubscribe callback. Cap 1024 — przy
 * przepełnieniu rzuca błąd (defensive — unmount procesu zwolniłby pamięć,
 * ale bez tego DoS przez tysiące jednoczesnych connections jest trywialne).
 */
export function subscribe(cb: SseSubscriber): () => void {
  if (subscribers.size >= MAX_SUBSCRIBERS) {
    logger.warn("sse-bus subscriber cap reached", { size: subscribers.size });
    throw new Error("Maximum SSE subscribers reached");
  }
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Broadcast eventa do wszystkich subscribersów. Każdy subscriber w try/catch
 * — jedna padnięta connection nie blokuje pozostałych. ID i ts są nadpisywane
 * gdy nieprzekazane.
 */
export function publish(
  input: Omit<SseEvent, "id" | "ts"> & { id?: string; ts?: string },
): void {
  const event: SseEvent = {
    id: input.id ?? randomUUID(),
    type: input.type,
    serviceId: input.serviceId,
    userEmail: input.userEmail ?? null,
    payload: input.payload,
    ts: input.ts ?? new Date().toISOString(),
  };
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch (err) {
      logger.warn("sse subscriber threw", {
        type: event.type,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** Diagnostyka — używane przez health endpointy / smoke tests. */
export function getSubscriberCount(): number {
  return subscribers.size;
}
