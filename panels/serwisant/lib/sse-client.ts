"use client";

/**
 * SSE client subscribe helper (Wave 19/Phase 1D + Wave 21 Faza 1G reconnect).
 *
 * `subscribeToService(serviceId, onEvent)` otwiera EventSource pod
 * `/api/sse?subscribe=service:<id>` (panel-side proxy do dashboard
 * `/api/events`).
 *
 * Wave 21 Faza 1G — explicit reconnect z exponential backoff (1s → 30s
 * cap). Browser EventSource ma natywny reconnect tylko gdy stream zamyka
 * się "czysto"; dla 4xx/5xx, network hiccupów lub idle close po 30 min
 * sami trzymamy stan i reconnectujemy.
 *
 * Dedup: każdy event ma `event.id` (UUID); klient odrzuca powtórzone id
 * (po reconnect serwer może wysłać replay).
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
  | "customer_message_sent"
  | "transport_job_created"
  | "transport_job_updated"
  | "component_added"
  | "component_updated"
  | "component_deleted"
  // Wave 21 / Faza 1D — off-channel notatka o kontakcie z klientem.
  | "customer_contact_recorded"
  // Wave 21 / Faza 1B — biblioteka dokumentów per zlecenie.
  | "document_created"
  | "document_updated"
  | "document_deleted";

export interface SsePushEvent {
  id: string;
  type: SsePushEventType;
  serviceId: string | null;
  userEmail?: string | null;
  payload: Record<string, unknown>;
  ts: string;
}

export type SsePushHandler = (event: SsePushEvent) => void;

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
  "customer_message_sent",
  "transport_job_created",
  "transport_job_updated",
  "component_added",
  "component_updated",
  "component_deleted",
  "customer_contact_recorded",
  "document_created",
  "document_updated",
  "document_deleted",
];

function openEventStream(
  subscribe: string,
  onEvent: SsePushHandler,
  onError?: (err: Event) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const url = `/api/sse?subscribe=${encodeURIComponent(subscribe)}`;

  let es: EventSource | null = null;
  let retryDelay = 1_000;
  let retryTimer: number | null = null;
  let closed = false;
  const seen = new Set<string>();
  // Limit dedup memory — keep last 256 ids.
  const trimSeen = () => {
    if (seen.size <= 256) return;
    const arr = Array.from(seen);
    for (let i = 0; i < arr.length - 256; i++) seen.delete(arr[i]);
  };
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

  const detach = (target: EventSource) => {
    for (const t of TYPES) {
      target.removeEventListener(t, handleNamed as EventListener);
    }
    target.onmessage = null;
    target.onerror = null;
    target.onopen = null;
  };

  const connect = () => {
    if (closed) return;
    es = new EventSource(url);
    for (const t of TYPES) {
      es.addEventListener(t, handleNamed as EventListener);
    }
    // Fallback dla unnamed messages (np. server-side error event z 'message').
    es.onmessage = handleNamed as (e: MessageEvent) => void;
    es.onopen = () => {
      // Sukces — reset backoff dla kolejnych disconnect-ów.
      retryDelay = 1_000;
    };
    es.onerror = (e) => {
      if (onError) onError(e);
      if (closed) return;
      // readyState=CLOSED → connection padł twardo (np. 4xx/5xx). Browser
      // sam nie spróbuje ponownie. CONNECTING → browser już reconnectuje
      // i nie potrzebuje pomocy.
      const state = es?.readyState;
      if (state === EventSource.CLOSED) {
        if (es) detach(es);
        es = null;
        if (retryTimer != null) window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          connect();
        }, Math.min(retryDelay, 30_000));
        retryDelay = Math.min(retryDelay * 2, 30_000);
      }
    };
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer != null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (es) {
      detach(es);
      es.close();
      es = null;
    }
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
