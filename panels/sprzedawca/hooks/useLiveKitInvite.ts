"use client";

/**
 * useLiveKitInvite — nasłuchuje SSE eventów `livekit_invite` /
 * `livekit_room_ended` z dashboard endpointu `/api/livekit/conversation-snapshot/stream`,
 * filtrowanego po conversation_id.
 *
 * EventSource cross-origin (panel sprzedawcy → myperformance.pl) działa bo
 * endpoint zwraca `Access-Control-Allow-Origin: *`. Bez auth — endpoint jest
 * read-only (sygnały eventów, payload sanitized).
 *
 * Stan:
 *   - invite: VideoInvite | null — current pending invite (display modal)
 *   - clear() — manualne zamknięcie (NIE kończy pokoju, tylko UI)
 */

import { useCallback, useEffect, useState } from "react";

import type { VideoInvite } from "../components/intake/IncomingVideoCallDialog";

const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
  "https://myperformance.pl";

interface SseEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export function useLiveKitInvite(conversationId: number | null): {
  invite: VideoInvite | null;
  clear: () => void;
} {
  const [invite, setInvite] = useState<VideoInvite | null>(null);

  useEffect(() => {
    if (conversationId == null) {
      setInvite(null);
      return;
    }

    const url = `${APP_BASE_URL}/api/livekit/conversation-snapshot/stream?conversation_id=${conversationId}`;
    const es = new EventSource(url);

    const onInvite = (ev: MessageEvent) => {
      try {
        const event = JSON.parse(ev.data) as SseEvent;
        const p = event.payload ?? {};
        const requiredFields = [
          "roomName",
          "mobilePublisherUrl",
          "qrCodeDataUrl",
          "joinUrl",
          "joinToken",
        ];
        for (const f of requiredFields) {
          if (typeof p[f] !== "string" || !p[f]) return;
        }
        const next: VideoInvite = {
          conversationId:
            typeof p.conversationId === "number"
              ? p.conversationId
              : conversationId,
          roomName: p.roomName as string,
          mobilePublisherUrl: p.mobilePublisherUrl as string,
          qrCodeDataUrl: p.qrCodeDataUrl as string,
          joinUrl: p.joinUrl as string,
          joinToken: p.joinToken as string,
          agentName:
            typeof p.agentName === "string" && p.agentName.trim()
              ? p.agentName.trim()
              : null,
          expiresAt:
            typeof p.expiresAt === "string"
              ? p.expiresAt
              : new Date(Date.now() + 30 * 60_000).toISOString(),
        };
        setInvite(next);
      } catch {
        // ignore malformed
      }
    };

    const onEnded = (ev: MessageEvent) => {
      try {
        const event = JSON.parse(ev.data) as SseEvent;
        const p = event.payload ?? {};
        // Zamykamy modal jeśli matching room — ignorujemy starsze ended
        // events które dochodzą z opóźnieniem dla wcześniejszych pokoi.
        setInvite((curr) => {
          if (!curr) return curr;
          if (typeof p.roomName === "string" && p.roomName === curr.roomName) {
            return null;
          }
          return curr;
        });
      } catch {
        // ignore
      }
    };

    es.addEventListener("livekit_invite", onInvite);
    es.addEventListener("livekit_room_ended", onEnded);
    return () => {
      es.close();
    };
  }, [conversationId]);

  const clear = useCallback(() => setInvite(null), []);

  return { invite, clear };
}
