export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { subscribe, type SseEvent } from "@/lib/sse-bus";

const logger = log.child({ module: "livekit-conv-snapshot-stream" });

const HEARTBEAT_MS = 25_000;
const MAX_CONNECTION_MS = 30 * 60_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "text/event-stream",
  Connection: "keep-alive",
  // Wyłącz buforowanie po stronie nginx/proxy.
  "X-Accel-Buffering": "no",
};

/**
 * GET /api/livekit/conversation-snapshot/stream?conversation_id=N
 *
 * Wave 24 — public Server-Sent Events dla Chatwoot Dashboard App iframe.
 * Klient (`IntakePreviewClient`) używa `EventSource(...)` zamiast pollingu
 * conversation-snapshot. Każdy POST sprzedawcy do `/api/panel/intake-drafts`
 * publishuje event "intake_draft_changed" do sse-bus, my filtrujemy po
 * `payload.conversationId === target` i pushujemy do iframe.
 *
 * Format SSE: `event: intake_draft_changed\ndata: {...}\n\n`. Klient
 * po otrzymaniu refreshuje widok przez fetch GET conversation-snapshot
 * (single source of truth — bus przesyła sygnał, nie payload).
 *
 * Public (bez auth) — agent Chatwoota nie ma KC sesji. Rate-limit per IP +
 * walidacja conversation_id. Hard close 30 min, EventSource auto-reconnect.
 */
export async function GET(req: Request): Promise<Response> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`livekit-conv-stream:${ip}`, {
    capacity: 30,
    refillPerSec: 30 / 60,
  });
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Zbyt wiele zapytań." }),
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("conversation_id")?.trim() ?? "";
  const conversationId = /^\d+$/.test(raw) ? Number(raw) : null;
  if (conversationId == null || conversationId <= 0) {
    return new Response(
      JSON.stringify({
        error: "Parametr `conversation_id` (number) jest wymagany.",
      }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let hardClose: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendChunk = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      sendChunk(`: connected conv=${conversationId} ts=${Date.now()}\n\n`);

      try {
        unsub = subscribe((event: SseEvent) => {
          // Wave 24 — przepuszczamy 3 typy filtrowane po conversationId:
          //   * intake_draft_changed (sprzedawca pisze litery)
          //   * livekit_invite (agent inicjuje rozmowę → modal popup)
          //   * livekit_room_ended (room_finished webhook → zamknij modal)
          if (
            event.type !== "intake_draft_changed" &&
            event.type !== "livekit_invite" &&
            event.type !== "livekit_room_ended"
          ) {
            return;
          }
          const eventConvId =
            typeof event.payload?.conversationId === "number"
              ? event.payload.conversationId
              : null;
          if (eventConvId !== conversationId) return;
          sendChunk(
            `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          );
        });
      } catch (err) {
        sendChunk(
          `event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`,
        );
        cleanup();
        return;
      }

      heartbeat = setInterval(() => {
        sendChunk(`: keep-alive ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      hardClose = setTimeout(() => {
        sendChunk(
          `event: reconnect\ndata: ${JSON.stringify({ reason: "max-lifetime" })}\n\n`,
        );
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, MAX_CONNECTION_MS);

      function cleanup(): void {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (hardClose) clearTimeout(hardClose);
        if (unsub) unsub();
      }

      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  logger.info("conv-snapshot stream subscribed", {
    conversationId,
    ip,
  });

  return new Response(stream, {
    status: 200,
    headers: CORS_HEADERS,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}
