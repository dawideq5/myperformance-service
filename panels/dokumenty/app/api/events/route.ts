import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { broadcast, subscribe, type EventPayload } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const roles = ((session.user as { roles?: string[] } | undefined)?.roles ?? []) as string[];
  if (!roles.includes("dokumenty_access") && !roles.includes("admin")) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: EventPayload) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event.type}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {}
      };

      controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`));

      const sub = subscribe(send);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {}
      }, 25000);

      const abort = () => {
        clearInterval(heartbeat);
        sub.unsubscribe();
        try {
          controller.close();
        } catch {}
      };

      (req as Request).signal?.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const roles = ((session.user as { roles?: string[] } | undefined)?.roles ?? []) as string[];
  if (!roles.includes("admin")) return new Response("Forbidden", { status: 403 });
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  broadcast({ type: "state.refresh", at: new Date().toISOString(), data: body });
  return new Response(null, { status: 204 });
}
