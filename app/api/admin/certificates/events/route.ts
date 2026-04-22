import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import { subscribeBindingEvents } from "@/lib/binding-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!canManageCertificates(session)) {
    return new Response("Forbidden", { status: 403 });
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

      send(`retry: 3000\n\n`);
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
