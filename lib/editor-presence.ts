/**
 * Editor presence cache (Wave 22 / F15 — real-time intake co-edit).
 *
 * Server-authoritative state of "kto edytuje zlecenie X teraz". Driven przez
 * `service.editor_heartbeat` eventy (publishowane przez sprzedawcę co 10s);
 * serwisant subskrybując SSE channel `service:<id>` dostaje natychmiastowy
 * snapshot na connect (state replay) plus późniejsze updates real-time.
 *
 * Stale entries (>30s bez heartbeatu) są:
 *  1. odfiltrowane z `getEditor()` (zwraca null)
 *  2. usuwane przez sweep timer co 5s, który publishuje syntetyczny
 *     `service.editor_disconnected` event żeby klient mógł zaktualizować UI
 *     bez polling.
 *
 * Single-process — żyje w pamięci jednego Node procesu, tak jak `sse-bus.ts`.
 * Dla multi-process trzeba wymienić na Redis pub/sub + TTL keys.
 */

import { log } from "@/lib/logger";
import { publish } from "@/lib/sse-bus";

const logger = log.child({ module: "editor-presence" });

/** Editor uznany za rozłączonego po 30s ciszy (3 missed heartbeats). */
export const PRESENCE_TIMEOUT_MS = 30_000;
/** Cadence sweepera — sprawdzamy stale entries co 5s. */
const SWEEP_INTERVAL_MS = 5_000;

export type EditorRole = "sales" | "service";

export interface EditorPresence {
  serviceId: string;
  /** KC sub (UUID) — stable per-user, użyty jako klucz w map. */
  byUserId: string;
  /** Email / preferred_username — wyświetlane w UI fallbackiem na sub. */
  byUserEmail: string;
  /** Friendly display name (KC name claim) — fallback do email. */
  byUserName: string;
  /** Czy editor jest sprzedawcą czy serwisantem (głównie sprzedawca w F15). */
  byUserRole: EditorRole;
  /** Timestamp ostatniego heartbeatu (ms epoch). */
  lastSeen: number;
}

type Key = string; // `${serviceId}::${byUserId}`

const presence = new Map<Key, EditorPresence>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function key(serviceId: string, byUserId: string): Key {
  return `${serviceId}::${byUserId}`;
}

function ensureSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of presence) {
      if (now - entry.lastSeen <= PRESENCE_TIMEOUT_MS) continue;
      presence.delete(k);
      try {
        publish({
          type: "service.editor_disconnected",
          serviceId: entry.serviceId,
          payload: {
            byUserId: entry.byUserId,
            byUserEmail: entry.byUserEmail,
            byUserName: entry.byUserName,
            byUserRole: entry.byUserRole,
            reason: "timeout",
          },
        });
      } catch (err) {
        logger.warn("presence sweep publish failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, SWEEP_INTERVAL_MS);
  // unref żeby nie blokować exitu procesu w testach.
  if (typeof sweepTimer === "object" && sweepTimer && "unref" in sweepTimer) {
    (sweepTimer as { unref?: () => void }).unref?.();
  }
}

/**
 * Zarejestruj heartbeat. Zwraca `true` gdy to nowy editor (callerzy mogą
 * wtedy publishować dodatkowy event "started editing"), `false` gdy update
 * istniejącej obecności.
 */
export function recordHeartbeat(input: Omit<EditorPresence, "lastSeen">): {
  isNew: boolean;
} {
  ensureSweeper();
  const k = key(input.serviceId, input.byUserId);
  const existing = presence.get(k);
  presence.set(k, { ...input, lastSeen: Date.now() });
  return { isNew: !existing };
}

/**
 * Explicit disconnect — np. unmount formularza. Zwraca rekord ostatniej
 * obecności (jeśli istniał) żeby caller mógł skończyć publishowanie eventu
 * z metadanymi usera.
 */
export function recordDisconnect(
  serviceId: string,
  byUserId: string,
): EditorPresence | null {
  const k = key(serviceId, byUserId);
  const existing = presence.get(k);
  if (!existing) return null;
  presence.delete(k);
  return existing;
}

/**
 * Snapshot aktualnych editorów dla danego service'a. Filtruje stale
 * (>30s bez heartbeatu) ale ich nie usuwa — sweeper robi to async.
 */
export function getActiveEditors(serviceId: string): EditorPresence[] {
  const now = Date.now();
  const out: EditorPresence[] = [];
  for (const entry of presence.values()) {
    if (entry.serviceId !== serviceId) continue;
    if (now - entry.lastSeen > PRESENCE_TIMEOUT_MS) continue;
    out.push(entry);
  }
  return out;
}

/** Diagnostyka — używane przez health endpointy / testy. */
export function getPresenceSize(): number {
  return presence.size;
}

/** Tylko do testów — czyści state. */
export function __resetPresenceForTests(): void {
  presence.clear();
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
