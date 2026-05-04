export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";

import { getOptionalEnv } from "@/lib/env";
import {
  endSession,
  getSessionByRoom,
  markSessionActive,
} from "@/lib/livekit-rooms";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import { publish } from "@/lib/sse-bus";
import { recordWebhookHit } from "@/lib/webhooks/health";

const logger = log.child({ module: "livekit-webhook" });

/**
 * LiveKit webhook receiver — Wave 22 / F16e.
 *
 * LiveKit posts JSON events (`room_started`, `room_finished`,
 * `participant_joined`, `participant_left`, ...) and signs the request
 * with a JWT in the `Authorization` header (HS256, signed by
 * `LIVEKIT_API_SECRET`). The body MUST be verified before parsing —
 * `WebhookReceiver.receive()` does both the signature check and the
 * protobuf/JSON decode in one call.
 *
 * We care about three events:
 *   - `participant_joined`  → flip session `waiting → active`
 *   - `room_finished`       → flip session `* → ended`, emit audit log
 *   - `participant_left`    → log only (the session lifecycle is governed
 *                             by `room_finished`, not per-participant exits)
 *
 * Idempotency: each handler is a no-op when the underlying state is
 * already there (`markSessionActive` only flips when waiting; `endSession`
 * only flips when not-already-ended). We always return 200 for known
 * events so LiveKit doesn't retry-storm.
 *
 * Fail-closed: 503 when `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` is missing.
 * 401 on signature verification failure.
 */

interface LiveKitParticipantInfo {
  identity?: string;
  name?: string;
  metadata?: string;
  joinedAt?: bigint | number | string;
}

interface LiveKitRoomInfo {
  name?: string;
  sid?: string;
  numParticipants?: number;
  creationTime?: bigint | number | string;
}

/**
 * Subset of `WebhookEvent` we care about. We treat the event as a plain
 * object after decoding — the protobuf type is structurally compatible.
 */
interface DecodedEvent {
  event: string;
  room?: LiveKitRoomInfo;
  participant?: LiveKitParticipantInfo;
  numDropped?: number;
  id?: string;
  createdAt?: bigint | number | string;
}

function getRoomName(ev: DecodedEvent): string | null {
  return ev.room?.name?.trim() ?? null;
}

export async function POST(req: Request) {
  // Per-IP rate limit. 60/min mirrors documenso webhook policy.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`webhook:livekit:${ip}`, {
    capacity: 60,
    refillPerSec: 1,
  });
  if (!rl.allowed) {
    logger.warn("webhook rate-limited", { ip });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Fail-closed when env is missing — same posture as the rest of `lib/livekit.ts`.
  const apiKey = getOptionalEnv("LIVEKIT_API_KEY", "").trim();
  const apiSecret = getOptionalEnv("LIVEKIT_API_SECRET", "").trim();
  if (!apiKey || !apiSecret) {
    logger.warn("livekit webhook called but env is missing");
    await recordWebhookHit("livekit", "auth_failed", undefined, "env missing");
    return NextResponse.json(
      { error: "LiveKit not configured" },
      { status: 503 },
    );
  }

  // Signature is computed over the raw body, so read it as text.
  // Header name is `Authorization` (the SDK's `authorizeHeader` constant
  // name is misleadingly spelled "Authorize" but the value matches).
  const rawBody = await req.text();
  const authHeader = req.headers.get("authorization") ?? "";

  let event: DecodedEvent;
  try {
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    // `receive()` throws on bad signature / decode error.
    const decoded = await receiver.receive(rawBody, authHeader);
    event = decoded as unknown as DecodedEvent;
  } catch (err) {
    logger.warn("livekit webhook auth failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    await recordWebhookHit("livekit", "auth_failed");
    return NextResponse.json(
      { error: "Bad signature" },
      { status: 401 },
    );
  }

  const eventName = event.event ?? "";
  const roomName = getRoomName(event);

  // Some LiveKit events (e.g. `egress_*`) don't have a room — we just ignore
  // them. Same for events on rooms we never created (foreign tenants on a
  // shared LiveKit deployment, though that's not our setup today).
  if (!roomName) {
    await recordWebhookHit("livekit", "ignored", eventName, "no room");
    return NextResponse.json({ ok: true, ignored: eventName });
  }

  try {
    if (eventName === "participant_joined") {
      const updated = await markSessionActive(roomName);
      if (!updated) {
        logger.info("participant_joined for unknown room", { roomName });
        await recordWebhookHit("livekit", "ignored", eventName, "unknown room");
        return NextResponse.json({ ok: true, ignored: "unknown room" });
      }
      logger.info("livekit participant joined", {
        roomName,
        identity: event.participant?.identity,
        status: updated.status,
      });
      await recordWebhookHit("livekit", "ok", eventName, "active");
      return NextResponse.json({ ok: true, action: "active" });
    }

    if (eventName === "participant_left") {
      // Informational only — session lifecycle is governed by `room_finished`.
      // A multi-publisher room (mobile + observer) shouldn't end just because
      // one client disconnected.
      const session = await getSessionByRoom(roomName);
      logger.info("livekit participant left", {
        roomName,
        identity: event.participant?.identity,
        sessionStatus: session?.status ?? "unknown",
      });
      await recordWebhookHit("livekit", "ok", eventName, "noted");
      return NextResponse.json({ ok: true, action: "noted" });
    }

    if (eventName === "room_finished") {
      const result = await endSession(roomName);
      if (!result) {
        logger.info("room_finished for unknown room", { roomName });
        await recordWebhookHit("livekit", "ignored", eventName, "unknown room");
        return NextResponse.json({ ok: true, ignored: "unknown room" });
      }
      const { session, justEnded } = result;
      // Re-delivery — row was already ended on a previous webhook hit.
      // Don't double-log to mp_service_actions; just acknowledge so LiveKit
      // stops retrying.
      if (!justEnded) {
        logger.info("room_finished re-delivery (already ended)", {
          roomName,
          serviceId: session.serviceId,
        });
        await recordWebhookHit("livekit", "ok", eventName, "redelivery");
        return NextResponse.json({ ok: true, action: "already_ended" });
      }
      // Wave 23 — sprzedawca może rozpocząć konsultację BEZ ticketu
      // (intake form jeszcze nie zapisany). Wtedy session.serviceId jest
      // null → pomijamy mp_service_actions log (nie ma do czego anchorować).
      if (session.serviceId) {
        void logServiceAction({
          serviceId: session.serviceId,
          action: "live_view_ended",
          actor: { email: session.requestedByEmail },
          summary: "Zakończono konsultację video",
          payload: {
            roomName,
            durationSec: session.durationSec ?? 0,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            numDropped: event.numDropped ?? 0,
            chatwootConversationId: session.chatwootConversationId,
          },
        });
      }
      // Wave 24 — push event do panelu sprzedawcy (modal popup zamyka się,
      // pozwala rozpocząć kolejną rozmowę). Filtrowany po conversationId
      // w SSE stream endpoint.
      if (session.chatwootConversationId != null) {
        publish({
          type: "livekit_room_ended",
          serviceId: session.serviceId,
          payload: {
            conversationId: session.chatwootConversationId,
            serviceId: session.serviceId,
            roomName,
            durationSec: session.durationSec ?? 0,
          },
        });
      }

      logger.info("livekit room finished", {
        roomName,
        serviceId: session.serviceId,
        durationSec: session.durationSec,
      });
      await recordWebhookHit(
        "livekit",
        "ok",
        eventName,
        `ended:${session.durationSec ?? 0}s`,
      );
      return NextResponse.json({
        ok: true,
        action: "ended",
        durationSec: session.durationSec ?? 0,
      });
    }

    // Unhandled events (room_started, track_published, egress_*, ...) are
    // intentional no-ops — we don't model them but we don't 4xx either.
    logger.debug("livekit webhook event ignored", { eventName, roomName });
    await recordWebhookHit("livekit", "ignored", eventName);
    return NextResponse.json({ ok: true, ignored: eventName });
  } catch (err) {
    logger.error("livekit webhook handler failed", {
      eventName,
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
    await recordWebhookHit(
      "livekit",
      "error",
      eventName,
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
