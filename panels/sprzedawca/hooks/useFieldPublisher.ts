"use client";

/**
 * useFieldPublisher (Wave 22 / F15 — real-time intake co-edit).
 *
 * Hook publishuje eventy do `/api/relay/services/<id>/editor-events` żeby
 * serwisant (lub inni viewerzy) widzieli na żywo edycję formularza intake.
 *
 * API:
 *   const { publishField } = useFieldPublisher(serviceId);
 *   ...
 *   onChange={(v) => { setBrand(v); publishField("brand", v); }}
 *
 * Zachowanie:
 *   - publishField(field, value) → debounced 500ms (per field), żeby
 *     trzymanie klawisza nie generowało lawiny POSTów
 *   - heartbeat co 10s (setInterval) — odświeża presence cache na serverze
 *   - on unmount → final disconnect POST (best-effort)
 *
 * Server-side identity: backend derived `byUserId/byUserEmail/byUserName/
 * byUserRole` z PanelUser (KC userinfo + realm_access.roles), więc klient
 * **nie podaje** żadnej identyfikacji w body — defense-in-depth.
 *
 * Bez serviceId hook jest no-op (intake przed assign'em ID).
 */

import { useEffect, useRef, useCallback } from "react";

const DEBOUNCE_MS = 500;
const HEARTBEAT_MS = 10_000;

type Body =
  | { kind: "heartbeat" }
  | { kind: "field_changed"; field: string; value: unknown }
  | { kind: "disconnected" };

async function send(serviceId: string, body: Body): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch(
      `/api/relay/services/${encodeURIComponent(serviceId)}/editor-events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // keepalive — pozwala dokończyć request nawet gdy strona się
        // unmountuje (final disconnect).
        keepalive: true,
      },
    );
  } catch {
    /* best-effort — jeśli network padnie, presence cache wygaśnie po 30s */
  }
}

export interface FieldPublisher {
  publishField: (field: string, value: unknown) => void;
  /** Wymuś natychmiastowe disconnect (np. po Submit). */
  disconnect: () => void;
}

export function useFieldPublisher(
  serviceId: string | null | undefined,
): FieldPublisher {
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);

  // Heartbeat lifecycle.
  useEffect(() => {
    if (!serviceId) return;
    activeRef.current = true;
    // Initial heartbeat — natychmiast po mount.
    void send(serviceId, { kind: "heartbeat" });
    heartbeatRef.current = setInterval(() => {
      if (!activeRef.current) return;
      void send(serviceId, { kind: "heartbeat" });
    }, HEARTBEAT_MS);
    return () => {
      activeRef.current = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      // Final disconnect — keepalive=true pozwala dokończyć po unmount.
      void send(serviceId, { kind: "disconnected" });
      // Wyczyść debounced field-change timery.
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, [serviceId]);

  const publishField = useCallback(
    (field: string, value: unknown) => {
      if (!serviceId) return;
      const existing = timersRef.current.get(field);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        timersRef.current.delete(field);
        void send(serviceId, { kind: "field_changed", field, value });
      }, DEBOUNCE_MS);
      timersRef.current.set(field, t);
    },
    [serviceId],
  );

  const disconnect = useCallback(() => {
    if (!serviceId) return;
    activeRef.current = false;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    for (const t of timersRef.current.values()) clearTimeout(t);
    timersRef.current.clear();
    void send(serviceId, { kind: "disconnected" });
  }, [serviceId]);

  return { publishField, disconnect };
}
