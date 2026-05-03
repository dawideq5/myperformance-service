export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  LiveKitNotConfiguredError,
  getRoomInfo,
  verifyJoinToken,
} from "@/lib/livekit";
import { getSessionByRoom } from "@/lib/livekit-rooms";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

const logger = log.child({ module: "livekit-room-status" });

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
 * GET /api/livekit/room-status?room=<name>&token=<signed-jwt>
 *
 * Wave 23 (overlay) — public polling endpoint dla sprzedawca QR view oraz
 * Chatwoot iframe (po inicjacji rozmowy). Klient pyta co kilka sekund:
 * "czy mobile publisher już dołączył?" — jeśli `publisherConnected=true`
 * UI zmienia stan z "oczekuje na zeskanowanie" na "trwa rozmowa".
 *
 * Auth: signed JWT (HS256, audience `mp-consultation-join`) wystawiony
 * przy starcie pokoju. Token MUSI zawierać claim `room` zgodny z `?room`
 * — bez tego anonim z internetu mógłby enumerować stan dowolnych pokoi
 * po nazwie.
 *
 * Rate limit: 60/min per IP.
 */
export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`livekit-room-status:${ip}`, {
    capacity: 60,
    refillPerSec: 1,
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
  const roomQuery = url.searchParams.get("room")?.trim() ?? "";
  const tokenQuery = url.searchParams.get("token")?.trim() ?? "";
  if (!roomQuery || !tokenQuery) {
    return NextResponse.json(
      { error: "Parametry `room` i `token` są wymagane." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let claims: { room: string };
  try {
    claims = await verifyJoinToken(tokenQuery);
  } catch {
    return NextResponse.json(
      { error: "Nieprawidłowy lub wygasły token." },
      { status: 401, headers: CORS_HEADERS },
    );
  }
  if (claims.room !== roomQuery) {
    return NextResponse.json(
      { error: "Token nie pasuje do tego pokoju." },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  // DB session (ground truth dla lifecycle: kto rozpoczął, kiedy).
  const dbSession = await getSessionByRoom(roomQuery);

  // LiveKit live state (number of participants + presence of publisher).
  let publisherConnected = false;
  let participantCount = 0;
  let liveKitReachable = true;
  try {
    const info = await getRoomInfo(roomQuery);
    participantCount = info.numParticipants;
    publisherConnected = info.participants.some(
      (p) => p.identity.startsWith("mobile-") || p.identity.includes("publisher"),
    );
  } catch (err) {
    if (err instanceof LiveKitNotConfiguredError) {
      liveKitReachable = false;
    } else {
      logger.warn("getRoomInfo failed", {
        roomName: roomQuery,
        err: err instanceof Error ? err.message : String(err),
      });
      liveKitReachable = false;
    }
  }

  // Status na podstawie DB sessions + live LiveKit data:
  //  - "ended" — DB mówi że pokój zamknięty
  //  - "active" — publisher widoczny w LiveKit lub DB status=active
  //  - "waiting" — pokój istnieje ale nikt nie dołączył jeszcze
  let status: "waiting" | "active" | "ended" | "unknown" = "unknown";
  if (dbSession) {
    if (dbSession.status === "ended") {
      status = "ended";
    } else if (publisherConnected || dbSession.status === "active") {
      status = "active";
    } else {
      status = "waiting";
    }
  } else if (liveKitReachable) {
    status = publisherConnected ? "active" : "waiting";
  }

  return NextResponse.json(
    {
      roomName: roomQuery,
      status,
      publisherConnected,
      participantCount,
      liveKitReachable,
      startedAt: dbSession?.startedAt ?? null,
      createdAt: dbSession?.createdAt ?? null,
      endedAt: dbSession?.endedAt ?? null,
    },
    { headers: CORS_HEADERS },
  );
}
