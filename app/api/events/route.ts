/**
 * Server-Sent Events endpoint (Wave 19/Phase 1D).
 *
 * Real-time push do paneli (sprzedawca/serwisant/kierowca/dashboard).
 * Klient subskrybuje przez `EventSource("/api/events?subscribe=service:<id>&token=<kc>")`
 * lub `?subscribe=user:<email>` (notyfikacje per user) lub `?subscribe=*` (admin).
 *
 * Auth
 * ────
 *  - Bearer header (preferowane gdy z fetch())
 *  - `?token=<kc-access-token>` (browser EventSource — nie wspiera headerów)
 *
 * Stream format
 * ─────────────
 *  - `Content-Type: text/event-stream`
 *  - Każdy event:  `id: <uuid>\nevent: <type>\ndata: <json>\n\n`
 *  - Heartbeat co 25s: `: keep-alive\n\n` (komentarz, EventSource ignoruje)
 *  - Hard close po 30 min — klient re-connectuje (EventSource auto-retry).
 *
 * UWAGA proxy
 * ───────────
 * Next.js relay (panels/<slug>/api/relay/[...path]) BUFORUJE response (arrayBuffer).
 * Dlatego paneli MUSZĄ używać dedykowanego streaming proxy
 * panels/<slug>/api/sse/route.ts, NIE relay.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";
import { subscribe, type SseEvent } from "@/lib/sse-bus";

const logger = log.child({ module: "api-events" });

/** Hard cap czasu życia connection — klient EventSource auto-reconnect. */
const MAX_CONNECTION_MS = 30 * 60_000;
/** Heartbeat interval — keep-alive dla proxy/load-balancerów. */
const HEARTBEAT_MS = 25_000;

interface SubscriptionFilter {
  serviceId?: string;
  userEmail?: string;
  all: boolean;
}

function parseSubscribe(raw: string | null): SubscriptionFilter | null {
  if (!raw) return null;
  if (raw === "*") return { all: true };
  const m = raw.match(/^(service|user):(.+)$/);
  if (!m) return null;
  const [, kind, value] = m;
  if (kind === "service") {
    if (!/^[0-9a-f-]{36}$/i.test(value)) return null;
    return { serviceId: value, all: false };
  }
  if (kind === "user") {
    return { userEmail: value.toLowerCase(), all: false };
  }
  return null;
}

function shouldDeliver(
  event: SseEvent,
  filter: SubscriptionFilter,
  viewerEmail: string,
): boolean {
  if (filter.all) return true;
  if (filter.serviceId && event.serviceId === filter.serviceId) return true;
  if (filter.userEmail) {
    // user-scoped subscription tylko dla siebie (nie pozwalamy podsłuchiwać
    // cudzych notyfikacji nawet ze zgody admina — defensive).
    if (filter.userEmail !== viewerEmail.toLowerCase()) return false;
    if (event.userEmail?.toLowerCase() === viewerEmail.toLowerCase())
      return true;
  }
  return false;
}

async function resolveViewer(
  req: Request,
): Promise<{ email: string; isAdmin: boolean } | null> {
  const url = new URL(req.url);
  const headerToken = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const queryToken = url.searchParams.get("token")?.trim();
  const accessToken = headerToken || queryToken;
  if (!accessToken) return null;
  try {
    const issuer = keycloak.getIssuer();
    const r = await fetch(`${issuer}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return null;
    const info = (await r.json()) as {
      email?: string;
      groups?: string[];
      realm_access?: { roles?: string[] };
    };
    if (!info.email) return null;
    const roles = info.realm_access?.roles ?? [];
    const isAdmin = roles.includes("admin") || roles.includes("superadmin");
    return { email: info.email, isAdmin };
  } catch (err) {
    logger.warn("sse userinfo failed", { err: String(err) });
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const filter = parseSubscribe(url.searchParams.get("subscribe"));
  if (!filter) {
    return new Response(
      JSON.stringify({
        error:
          "Wymagane: ?subscribe=service:<uuid> | user:<email> | * (admin only)",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const viewer = await resolveViewer(req);
  if (!viewer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (filter.all && !viewer.isAdmin) {
    return new Response(
      JSON.stringify({ error: "Subscribe=* tylko dla admina" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  if (filter.userEmail && filter.userEmail !== viewer.email.toLowerCase()) {
    return new Response(
      JSON.stringify({ error: "Subscribe=user: tylko własny email" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let hardClose: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendChunk = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller already closed (klient odłączył się) — sprzątamy.
          cleanup();
        }
      };

      // Initial comment — flush headerów u proxy.
      sendChunk(`: connected ts=${Date.now()}\n\n`);

      try {
        unsub = subscribe((event) => {
          if (!shouldDeliver(event, filter, viewer.email)) return;
          const payload = JSON.stringify(event);
          sendChunk(`id: ${event.id}\nevent: ${event.type}\ndata: ${payload}\n\n`);
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

      function cleanup() {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (hardClose) clearTimeout(hardClose);
        if (unsub) unsub();
      }

      // AbortSignal — gdy klient close()uje stream.
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (hardClose) clearTimeout(hardClose);
      if (unsub) unsub();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Disable Nginx buffering (jeśli proxy stoi przed Next).
      "X-Accel-Buffering": "no",
    },
  });
}
