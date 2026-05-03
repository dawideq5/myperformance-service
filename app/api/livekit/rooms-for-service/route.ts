export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { withClient } from "@/lib/db";
import { ensureSchema } from "@/lib/livekit-rooms";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

const logger = log.child({ module: "livekit-rooms-for-service" });

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/livekit/rooms-for-service?service_id=… or ?conversation_id=…
 *
 * Wave 23 (overlay) — Chatwoot Dashboard App polling. Pokazuje agentowi
 * listę aktywnych konsultacji video powiązanych z service_id LUB
 * chatwoot_conversation_id. Iframe Chatwoot polluje co 5 s.
 *
 * Public (CORS *) bo iframe nie ma KC sesji. Zwraca tylko nieczułe
 * metadata (room_name, status, kto zainicjował, czas trwania) — żadnych
 * tokenów, więc nie da się użyć tego do dołączenia bez signed join token
 * (osobno minted).
 *
 * Rate limit: 90 req/min per IP (chatwoot agent może mieć kilka kart
 * otwartych równolegle, polling co 5s = 12 req/min na kartę).
 */
export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`livekit-rooms-for-service:${ip}`, {
    capacity: 90,
    refillPerSec: 1.5,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele zapytań." },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const url = new URL(req.url);
  const serviceId = url.searchParams.get("service_id")?.trim() ?? "";
  const conversationIdRaw =
    url.searchParams.get("conversation_id")?.trim() ?? "";
  const conversationId = conversationIdRaw
    ? Number.parseInt(conversationIdRaw, 10)
    : null;

  if (!serviceId && (conversationId === null || Number.isNaN(conversationId))) {
    return NextResponse.json(
      { error: "Wymagany jest `service_id` lub `conversation_id`." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  await ensureSchema();

  type Row = {
    id: string;
    room_name: string;
    service_id: string | null;
    chatwoot_conversation_id: number | null;
    requested_by_email: string;
    status: string;
    created_at: string;
    started_at: string | null;
    ended_at: string | null;
    duration_sec: number | null;
  };

  const rows = await withClient(async (c) => {
    const where: string[] = ["status IN ('waiting', 'active')"];
    const params: unknown[] = [];
    if (serviceId) {
      params.push(serviceId);
      where.push(`service_id = $${params.length}`);
    }
    if (conversationId !== null && !Number.isNaN(conversationId)) {
      params.push(conversationId);
      where.push(`chatwoot_conversation_id = $${params.length}`);
    }
    const r = await c.query<Row>(
      `SELECT id, room_name, service_id, chatwoot_conversation_id,
              requested_by_email, status,
              created_at::text, started_at::text, ended_at::text, duration_sec
         FROM mp_livekit_sessions
        WHERE ${where.join(" OR ")}
        ORDER BY created_at DESC
        LIMIT 20`,
      params,
    );
    return r.rows;
  });

  logger.info("rooms-for-service served", {
    serviceId: serviceId || null,
    conversationId,
    count: rows.length,
  });

  return NextResponse.json(
    {
      rooms: rows.map((r) => ({
        id: r.id,
        roomName: r.room_name,
        serviceId: r.service_id,
        chatwootConversationId: r.chatwoot_conversation_id,
        requestedByEmail: r.requested_by_email,
        status: r.status,
        createdAt: r.created_at,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        durationSec: r.duration_sec,
      })),
      timestamp: new Date().toISOString(),
    },
    { headers: CORS_HEADERS },
  );
}
