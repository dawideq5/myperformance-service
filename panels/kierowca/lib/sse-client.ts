"use client";

/**
 * SSE client subscribe helper (Wave 19/Phase 1D).
 *
 * `subscribeToService(serviceId, onEvent)` otwiera EventSource pod
 * `/api/sse?subscribe=service:<id>` (panel-side proxy do dashboard
 * `/api/events`). EventSource auto-reconnect przy disconnect — server-side
 * 30 min hard close jest invisible dla klienta.
 *
 * Dedup: każdy event ma `event.id` (UUID); klient powinien odrzucać
 * powtórzone id (np. po reconnect). Zwracamy raw event z bus payload.
 */

export type SsePushEventType =
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
  | "transport_job_created"
  | "transport_job_updated";

export interface SsePushEvent {
  id: string;
  type: SsePushEventType;
  serviceId: string | null;
  userEmail?: string | null;
  payload: Record<string, unknown>;
  ts: string;
}

export type SsePushHandler = (event: SsePushEvent) => void;

function openEventStream(
  subscribe: string,
  onEvent: SsePushHandler,
  onError?: (err: Event) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const url = `/api/sse?subscribe=${encodeURIComponent(subscribe)}`;
  const es = new EventSource(url);
  const seen = new Set<string>();
  // Limit dedup memory — keep last 256 ids.
  const trimSeen = () => {
    if (seen.size <= 256) return;
    const arr = Array.from(seen);
    for (let i = 0; i < arr.length - 256; i++) seen.delete(arr[i]);
  };
  // Bus eventy używają nazwanych typów (event: <type>). EventSource emituje
  // tylko 'message' dla unnamed; dla nazwanych trzeba addEventListener per
  // type. Jednak nasz endpoint wysyła `event: <type>`, więc rejestrujemy
  // listener dla każdego znanego typu.
  const TYPES: SsePushEventType[] = [
    "action_logged",
    "status_changed",
    "service_updated",
    "annex_created",
    "annex_accepted",
    "annex_rejected",
    "annex_completed",
    "photo_uploaded",
    "photo_deleted",
    "internal_note_added",
    "internal_note_deleted",
    "internal_note_pinned",
    "internal_note_unpinned",
    "chat_message_received",
    "transport_job_created",
    "transport_job_updated",
  ];
  const handleNamed = (e: MessageEvent) => {
    try {
      const parsed = JSON.parse(e.data) as SsePushEvent;
      if (parsed.id && seen.has(parsed.id)) return;
      if (parsed.id) {
        seen.add(parsed.id);
        trimSeen();
      }
      onEvent(parsed);
    } catch {
      /* ignore malformed */
    }
  };
  for (const t of TYPES) es.addEventListener(t, handleNamed as EventListener);
  // Fallback dla unnamed messages (np. server-side error event z 'message').
  es.onmessage = handleNamed as (e: MessageEvent) => void;
  es.onerror = (e) => {
    if (onError) onError(e);
  };
  return () => {
    for (const t of TYPES)
      es.removeEventListener(t, handleNamed as EventListener);
    es.close();
  };
}

export function subscribeToService(
  serviceId: string,
  onEvent: SsePushHandler,
  onError?: (err: Event) => void,
): () => void {
  return openEventStream(`service:${serviceId}`, onEvent, onError);
}

export function subscribeToUser(
  email: string,
  onEvent: SsePushHandler,
  onError?: (err: Event) => void,
): () => void {
  return openEventStream(`user:${email}`, onEvent, onError);
}
