import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import { subscribeBindingEvents } from "@/lib/binding-events";
import { listRecentBindingEvents } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Two modes on the same URL:
 *
 * 1. Accept: text/event-stream → SSE push (best-effort, zero-latency).
 * 2. Anything else            → JSON polling. Client sends `?after=<eventId>`
 *    and gets the events table rows that arrived since. Always correct — used
 *    as a fallback when SSE is blocked by a proxy (or broken for any other
 *    reason). 3 s poll gives quasi-realtime.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageCertificates(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accept = req.headers.get("accept") ?? "";
  const wantsStream = accept.includes("text/event-stream");

  if (!wantsStream) {
    const after = req.nextUrl.searchParams.get("after");
    const events = await listRecentBindingEvents({ afterId: after });
    return NextResponse.json({ events });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // stream already closed — the cancel hook will clean up
        }
      };

      // 2 kB padding defeats any proxy that buffers small bursts.
      send(`retry: 3000\n\n`);
      send(`: ${"x".repeat(2048)}\n\n`);
      send(`event: ready\ndata: {}\n\n`);

      unsubscribe = subscribeBindingEvents((event) => {
        send(`event: binding\ndata: ${JSON.stringify(event)}\n\n`);
      });

      keepalive = setInterval(() => {
        send(`: keep-alive ${Date.now()}\n\n`);
      }, 25_000);
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
      if (keepalive) clearInterval(keepalive);
      keepalive = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
