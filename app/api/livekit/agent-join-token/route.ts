export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  LiveKitNotConfiguredError,
  buildJoinUrl,
  signJoinToken,
  verifyChatwootInitiateToken,
} from "@/lib/livekit";
import { getSessionByRoom } from "@/lib/livekit-rooms";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

const logger = log.child({ module: "livekit-agent-join-token" });

const APP_BASE =
  getOptionalEnv("NEXT_PUBLIC_APP_URL").trim().replace(/\/$/, "") ||
  "https://myperformance.pl";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface Body {
  initiateToken?: unknown;
  roomName?: unknown;
}

/**
 * POST /api/livekit/agent-join-token
 *
 * Wave 23 (overlay) — Chatwoot agent z Dashboard App iframe potrzebuje
 * signed join tokenu żeby JoinModeSelector mógł zrobić embedded
 * subscriber view (LiveKit access token wymienia później przez
 * /api/livekit/join-token).
 *
 * Auth = `initiateToken` (HS256 audience `mp-chatwoot-initiate`, TTL 5
 * min, claim `serviceId`) który iframe dostaje z intake-snapshot.
 *
 * Cross-service guard: token zawiera `serviceId`, requested room MUSI
 * mieć `service_id === claims.serviceId` w mp_livekit_sessions. Bez tego
 * agent z konwersacji A mógłby zażądać tokenu do pokoju z konwersacji B
 * (jeśli zna jego `roomName`).
 *
 * Mintuje signed join token z identity `Agent Chatwoot`, TTL 30 min.
 * Response: { joinToken, joinUrl, roomName, ttlSec }.
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`livekit-agent-join:${ip}`, {
    capacity: 30,
    refillPerSec: 30 / 60,
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Oczekiwano JSON" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const initiateToken =
    typeof body.initiateToken === "string" ? body.initiateToken.trim() : "";
  const roomName =
    typeof body.roomName === "string" ? body.roomName.trim() : "";

  if (!initiateToken || !roomName) {
    return NextResponse.json(
      { error: "Pola `initiateToken` i `roomName` są wymagane." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let claimedServiceId: string | null = null;
  let claimedConversationId: number | null = null;
  try {
    const claims = await verifyChatwootInitiateToken(initiateToken);
    claimedServiceId = claims.serviceId;
    claimedConversationId = claims.conversationId;
  } catch (err) {
    logger.info("initiate token rejected", {
      ip,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Token wygasł lub jest nieprawidłowy. Odśwież iframe." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const session = await getSessionByRoom(roomName);
  if (!session) {
    return NextResponse.json(
      { error: "Pokój nie istnieje." },
      { status: 404, headers: CORS_HEADERS },
    );
  }
  // Wave 24 — cross-context guard działa per-anchor:
  //   * service-anchored token → session.serviceId musi się zgadzać.
  //   * conversation-anchored token → session.chatwootConversationId
  //     musi się zgadzać. Sprzedawca może mieć room którego serviceId
  //     jeszcze nie istnieje (start-publisher z chatwootConversationId
  //     bez serviceId); musimy zezwolić tu na join.
  const matchesService =
    claimedServiceId != null && session.serviceId === claimedServiceId;
  const matchesConversation =
    claimedConversationId != null &&
    session.chatwootConversationId === claimedConversationId;
  if (!matchesService && !matchesConversation) {
    logger.warn("cross-context room access attempt", {
      ip,
      roomName,
      sessionServiceId: session.serviceId,
      sessionConversationId: session.chatwootConversationId,
      claimedServiceId,
      claimedConversationId,
    });
    return NextResponse.json(
      { error: "Pokój nie należy do tego service'u/konwersacji." },
      { status: 403, headers: CORS_HEADERS },
    );
  }
  if (session.status === "ended") {
    return NextResponse.json(
      { error: "Pokój jest już zakończony." },
      { status: 410, headers: CORS_HEADERS },
    );
  }

  let joinToken: string;
  try {
    joinToken = await signJoinToken({
      roomName,
      identity: "Agent Chatwoot",
      ttlSec: 30 * 60,
    });
  } catch (err) {
    if (err instanceof LiveKitNotConfiguredError) {
      return NextResponse.json(
        { error: "LiveKit nie jest skonfigurowany." },
        { status: 503, headers: CORS_HEADERS },
      );
    }
    logger.error("signJoinToken failed", {
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się wygenerować tokenu." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const joinUrl = buildJoinUrl(APP_BASE, roomName, joinToken);

  logger.info("agent join token issued", {
    roomName,
    serviceId: claimedServiceId,
    conversationId: claimedConversationId,
  });

  return NextResponse.json(
    { joinToken, joinUrl, roomName, ttlSec: 30 * 60 },
    { headers: CORS_HEADERS },
  );
}
