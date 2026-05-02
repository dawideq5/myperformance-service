/**
 * SSE proxy — streaming forward do dashboard `/api/events`.
 *
 * Dlaczego osobny handler (a nie generic `/api/relay/[...path]`)?
 *   - Generic relay buforuje response (`arrayBuffer()`) — psuje SSE bo każdy
 *     event flushuje się dopiero po close().
 *   - Generic relay ma 15s timeout. SSE potrzebuje 30 min (max-lifetime
 *     server-side, klient auto-reconnect przez EventSource).
 *
 * Tutaj robimy `fetch(... { duplex: "half" })` i zwracamy `response.body`
 * jako readable stream → Next.js przekazuje bytes 1:1 do klienta.
 *
 * Auth: pobiera KC accessToken z NextAuth session i wstrzykuje jako
 * `?token=<...>` (browser EventSource nie umie headerów).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

export async function GET(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  const url = new URL(req.url);
  const subscribe = url.searchParams.get("subscribe");
  if (!subscribe) {
    return NextResponse.json(
      { error: "Missing ?subscribe param" },
      { status: 400 },
    );
  }
  const target = new URL(`${DASHBOARD_URL}/api/events`);
  target.searchParams.set("subscribe", subscribe);
  target.searchParams.set("token", accessToken);

  // Forward bez timeout — klient jest stronie kontroli connection lifetime
  // (req.signal abort). NextResponse z body = stream → flushowane na bieżąco.
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: req.signal,
      // @ts-expect-error — `duplex: "half"` wymagane przez Node fetch dla
      // streaming body, brak w lib.dom. Bez tego niektóre wersje Node
      // wymuszają full body buffer.
      duplex: "half",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "upstream_failed", detail: String(err) },
      { status: 502 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "upstream_status", status: upstream.status },
      { status: 502 },
    );
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
