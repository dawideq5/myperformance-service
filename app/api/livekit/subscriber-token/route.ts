export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  LiveKitNotConfiguredError,
  createSubscriberToken,
  getLiveKitUrl,
} from "@/lib/livekit";
import { log } from "@/lib/logger";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getService } from "@/lib/services";

const logger = log.child({ module: "livekit-subscriber-token" });

/**
 * Room names are minted by `request-view` with the shape
 * `mp-service-<uuid>-<base64url>`. We parse the service id back out so we
 * can verify the caller still has location-scoped access to the service
 * before issuing a subscriber token. A serwisant who got moved off a
 * location must not be able to keep watching its rooms.
 *
 * UUID shape is anchored explicitly (8-4-4-4-12 hex) so the suffix can't
 * accidentally bleed into the captured group when the random suffix happens
 * to contain only hex characters.
 */
const ROOM_NAME_RE =
  /^mp-service-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-[A-Za-z0-9_-]+$/;

function extractServiceId(roomName: string): string | null {
  const m = roomName.match(ROOM_NAME_RE);
  return m ? m[1] : null;
}

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId)) return true;
  if (
    service.serviceLocationId &&
    locationIds.includes(service.serviceLocationId)
  )
    return true;
  return false;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

/**
 * GET /api/livekit/subscriber-token?room=<roomName>
 *
 * Issues a subscribe-only LiveKit token for the authenticated panel user.
 * The token's identity is the user's email (matches our other panels'
 * actor convention so participant lists are human-readable).
 *
 * Returns: `{ token, url }` — `url` is the LiveKit WS endpoint the client
 * passes to `livekit-client.connect(url, token)`.
 */
export async function GET(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }

  // Subscriber tokens are issued every time a serwisant opens the viewer
  // (page reload, modal toggle). 30/min is comfortably above any UI burst
  // while still bounding abuse if a token is leaked.
  const rl = rateLimit(`livekit-subscriber-token:${user.email}`, {
    capacity: 30,
    refillPerSec: 30 / 60,
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

  const url = new URL(req.url);
  const roomName = url.searchParams.get("room")?.trim() ?? "";
  if (!roomName) {
    return NextResponse.json(
      { error: "Parametr `room` jest wymagany." },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // Defence in depth: room name format is enforced + service ownership
  // re-verified on every issue (KC role alone isn't enough — a serwisant
  // can only watch rooms tied to services in their assigned locations).
  const serviceId = extractServiceId(roomName);
  if (!serviceId) {
    return NextResponse.json(
      { error: "Niepoprawna nazwa pokoju." },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const service = await getService(serviceId);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  let token: string;
  let livekitUrl: string;
  try {
    token = await createSubscriberToken({
      identity: user.email,
      roomName,
      ttlSec: 30 * 60,
      name: user.name?.trim() || user.preferred_username || user.email,
      metadata: JSON.stringify({ role: "subscriber", serviceId }),
    });
    livekitUrl = getLiveKitUrl();
  } catch (err) {
    if (err instanceof LiveKitNotConfiguredError) {
      logger.warn("LiveKit not configured", { err: err.message });
      return NextResponse.json(
        { error: "Live view jest tymczasowo niedostępny." },
        { status: 503, headers: PANEL_CORS_HEADERS },
      );
    }
    logger.error("subscriber-token failed", {
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się wygenerować tokenu." },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  // Note: we DON'T log to mp_service_actions on every subscriber-token fetch.
  // The durable audit trail is owned by `live_view_started` (request-view)
  // and `live_view_ended` (F16e webhook). Per-fetch panel reloads would
  // generate noise events. The structured `logger.info` below is sufficient
  // for "who pulled a token" reconstruction.
  logger.info("subscriber token issued", {
    serviceId,
    roomName,
    subscriber: user.email,
  });

  return NextResponse.json(
    {
      token,
      url: livekitUrl,
      roomName,
    },
    { headers: PANEL_CORS_HEADERS },
  );
}
