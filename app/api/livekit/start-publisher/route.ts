export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { getOptionalEnv } from "@/lib/env";
import {
  LiveKitNotConfiguredError,
  buildJoinUrl,
  createBrowserPublisherToken,
  createRoom,
  getLiveKitUrl,
  signJoinToken,
} from "@/lib/livekit";
import {
  LiveKitSessionConflictError,
  createSession,
  listActiveSessionsByUser,
} from "@/lib/livekit-rooms";
import { sendPrivateNote } from "@/lib/chatwoot-customer";
import { log } from "@/lib/logger";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import { getService } from "@/lib/services";

const logger = log.child({ module: "livekit-start-publisher" });

const APP_BASE =
  getOptionalEnv("NEXT_PUBLIC_APP_URL").trim().replace(/\/$/, "") ||
  "https://myperformance.pl";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

function shortId(bytes = 5): string {
  return randomBytes(bytes).toString("base64url");
}

interface StartPublisherBody {
  serviceId?: unknown;
  /** Conversation Chatwoot do której wrzucić link konsultacyjny. */
  chatwootConversationId?: unknown;
}

/**
 * POST /api/livekit/start-publisher
 *
 * Wave 23 — sprzedawca rozpoczyna konsultację video w intake formularzu.
 * Może to zrobić ZANIM zapisał ticket (`serviceId` opcjonalne — wtedy
 * sesja LiveKit nie jest powiązana z żadnym service'em w DB).
 *
 * Flow:
 *   1. Tworzymy LiveKit room `mp-consultation-<rand>`.
 *   2. Wystawiamy publisher token sprzedawcy (publish+subscribe — laptop
 *      camera; subscribe żeby zobaczył agenta gdy ten włączy kamerę).
 *   3. Podpisujemy join URL do `/konsultacja/<room>?token=...` (HS256
 *      audience-scoped do `mp-consultation-join`, TTL 30 min).
 *   4. Jeśli `chatwootConversationId` jest podany (lub można go wyciągnąć
 *      z service'u), wstrzykujemy link w wiadomość Chatwoot — agent
 *      kliknie i dołączy jako subscriber.
 *
 * Body: { serviceId?: string, chatwootConversationId?: number }
 * Response: { roomName, publisherToken, livekitUrl, joinUrl, joinToken,
 *             expiresAt, chatwootMessageSent }
 */
export async function POST(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }

  const rl = rateLimit(`livekit-start-publisher:${user.email}`, {
    capacity: 6,
    refillPerSec: 6 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele zapytań — odczekaj chwilę." },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: StartPublisherBody;
  try {
    body = (await req.json()) as StartPublisherBody;
  } catch {
    body = {};
  }
  const serviceId =
    typeof body.serviceId === "string" && body.serviceId.trim().length > 0
      ? body.serviceId.trim()
      : null;
  let chatwootConversationId =
    typeof body.chatwootConversationId === "number" &&
    Number.isFinite(body.chatwootConversationId)
      ? body.chatwootConversationId
      : null;

  // Jeśli sprzedawca podał serviceId — sprawdzamy ownership locationowe
  // i wyciągamy chatwootConversationId z service'u (gdy nie był jawny).
  if (serviceId) {
    const service = await getService(serviceId);
    if (!service) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: PANEL_CORS_HEADERS },
      );
    }
    const owns =
      user.locationIds.length > 0 &&
      ((service.locationId && user.locationIds.includes(service.locationId)) ||
        (service.serviceLocationId &&
          user.locationIds.includes(service.serviceLocationId)));
    if (!owns) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: PANEL_CORS_HEADERS },
      );
    }
    if (!chatwootConversationId && service.chatwootConversationId) {
      chatwootConversationId = service.chatwootConversationId;
    }
  }

  // Hard limit: max 1 active session per user.
  try {
    const active = await listActiveSessionsByUser(user.email);
    if (active.length > 0) {
      return NextResponse.json(
        {
          error:
            "Masz już aktywną konsultację. Zakończ ją przed rozpoczęciem nowej.",
          activeRoomName: active[0].roomName,
        },
        { status: 429, headers: PANEL_CORS_HEADERS },
      );
    }
  } catch (err) {
    logger.warn("listActiveSessionsByUser failed (continuing)", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const roomName = `mp-consultation-${shortId(6)}`;

  let publisherToken: string;
  let joinToken: string;
  let livekitUrl: string;
  try {
    await createRoom({
      name: roomName,
      emptyTimeoutSec: 30 * 60,
      maxParticipants: 5,
      metadata: JSON.stringify({
        kind: "consultation",
        serviceId,
        chatwootConversationId,
        requestedBy: user.email,
        createdAt: new Date().toISOString(),
      }),
    });
    publisherToken = await createBrowserPublisherToken({
      identity: user.email,
      roomName,
      ttlSec: 30 * 60,
      name:
        user.name?.trim() ||
        user.preferred_username ||
        user.email,
      metadata: JSON.stringify({ role: "publisher", serviceId }),
    });
    joinToken = await signJoinToken({
      roomName,
      identity: "Konsultant Chatwoot",
      ttlSec: 30 * 60,
    });
    livekitUrl = getLiveKitUrl();
  } catch (err) {
    if (err instanceof LiveKitNotConfiguredError) {
      logger.warn("LiveKit not configured", { err: err.message });
      return NextResponse.json(
        { error: "Konsultacja video jest tymczasowo niedostępna." },
        { status: 503, headers: PANEL_CORS_HEADERS },
      );
    }
    logger.error("start-publisher failed", {
      roomName,
      serviceId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się rozpocząć konsultacji." },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }

  try {
    await createSession({
      roomName,
      serviceId,
      chatwootConversationId,
      requestedByEmail: user.email,
    });
  } catch (err) {
    if (err instanceof LiveKitSessionConflictError) {
      return NextResponse.json(
        {
          error:
            "Masz już aktywną konsultację. Zakończ ją przed rozpoczęciem nowej.",
        },
        { status: 429, headers: PANEL_CORS_HEADERS },
      );
    }
    logger.warn("createSession failed (continuing without persistence)", {
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const joinUrl = buildJoinUrl(APP_BASE, roomName, joinToken);

  // Best-effort: wstrzykuje link w Chatwoot conversation. Brak conv id =
  // sprzedawca dostaje URL w response body żeby wkleić ręcznie.
  let chatwootMessageSent = false;
  if (chatwootConversationId) {
    const ok = await sendPrivateNote(
      chatwootConversationId,
      `🎥 Konsultacja video: ${joinUrl}\n\nLink wygasa za 30 minut. Kliknij, aby dołączyć jako uczestnik (audio + video tylko do odbioru).`,
    );
    chatwootMessageSent = ok;
    if (!ok) {
      logger.warn("chatwoot message inject failed", {
        roomName,
        chatwootConversationId,
      });
    }
  }

  if (serviceId) {
    void logServiceAction({
      serviceId,
      action: "live_view_started",
      actor: {
        email: user.email,
        name: user.name?.trim() || user.preferred_username || user.email,
      },
      summary: "Rozpoczęto konsultację video",
      payload: {
        roomName,
        chatwootConversationId,
        chatwootMessageSent,
      },
    });
  }

  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

  logger.info("consultation started", {
    roomName,
    serviceId,
    chatwootConversationId,
    chatwootMessageSent,
    requestedBy: user.email,
  });

  return NextResponse.json(
    {
      roomName,
      publisherToken,
      livekitUrl,
      joinUrl,
      joinToken,
      chatwootMessageSent,
      expiresAt,
    },
    { status: 201, headers: PANEL_CORS_HEADERS },
  );
}
