export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { NextResponse } from "next/server";

import { getOptionalEnv } from "@/lib/env";
import {
  LiveKitNotConfiguredError,
  createPublisherToken,
  createRoom,
  getLiveKitUrl,
} from "@/lib/livekit";
import {
  LiveKitSessionConflictError,
  createSession,
  listActiveSessionsByUser,
} from "@/lib/livekit-rooms";
import { log } from "@/lib/logger";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import { getService } from "@/lib/services";

const logger = log.child({ module: "livekit-request-view" });

/** Where the mobile publisher PWA lives — F16c builds the page at /livestream. */
const UPLOAD_BRIDGE_BASE =
  getOptionalEnv("UPLOAD_BRIDGE_URL") || "https://upload.myperformance.pl";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
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

/**
 * Builds the deeplink the mobile-publisher scans from the QR. We keep the
 * path stable (`/livestream`) and pass `room` + `token` as query params; the
 * upload-bridge PWA reads them client-side, requests camera/mic and connects
 * to LiveKit. URL-encoding both fields defends against any future room-name
 * scheme that includes reserved chars.
 */
function buildPublisherUrl(roomName: string, publisherToken: string): string {
  const base = UPLOAD_BRIDGE_BASE.replace(/\/$/, "");
  const room = encodeURIComponent(roomName);
  const token = encodeURIComponent(publisherToken);
  return `${base}/livestream?room=${room}&token=${token}`;
}

/**
 * Generates a short, URL-safe random suffix so per-call room names don't
 * collide if a serwisant retries the request for the same service.
 */
function shortId(bytes = 6): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * POST /api/livekit/request-view
 *
 * Body: `{ serviceId: string }`
 *
 * Authenticated panel user requests a live device view. We:
 *   1. validate access to the service (location-scoped),
 *   2. create a LiveKit room (`mp-service-<id>-<rand>`),
 *   3. issue a publisher token (mobile, identity=`mobile-<short>`),
 *   4. encode the publisher deeplink as a QR data URL,
 *   5. log a `live_view_started` action (audit trail in mp_service_actions).
 *
 * Returns: `{ roomName, publisherUrl, qrCodeDataUrl, expiresAt, livekitUrl }`.
 * The serwisant's panel uses `roomName` to call `GET /subscriber-token?room=`
 * for the subscriber side.
 */
export async function POST(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }

  // Room creation hits LiveKit REST + JWT signing — more expensive than a
  // plain token issue. Cap to 6/min per user; matches upload-bridge's
  // bursty-but-bounded policy.
  const rl = rateLimit(`livekit-request-view:${user.email}`, {
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

  let body: { serviceId?: unknown };
  try {
    body = (await req.json()) as { serviceId?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Oczekiwano JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const serviceId =
    typeof body.serviceId === "string" ? body.serviceId.trim() : "";
  if (!serviceId) {
    return NextResponse.json(
      { error: "Pole `serviceId` jest wymagane." },
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

  // Hard limit: max 1 non-ended LiveKit session per serwisant. The friendly
  // pre-check covers the common case; the partial unique index in
  // `mp_livekit_sessions` is the actual race-safe gate (see livekit-rooms.ts).
  // Without this a sloppy double-click would burn 2 LiveKit rooms (and 2
  // 30-min idle slots until the empty-timeout fires).
  try {
    const activeSessions = await listActiveSessionsByUser(user.email);
    if (activeSessions.length > 0) {
      return NextResponse.json(
        {
          error:
            "Masz już aktywną rozmowę. Zakończ ją przed rozpoczęciem nowej.",
        },
        { status: 429, headers: PANEL_CORS_HEADERS },
      );
    }
  } catch (err) {
    // DB hiccup → don't fail-closed (LiveKit room creation isn't reversible),
    // log + continue. The unique index will still gate concurrent creates.
    logger.warn("listActiveSessionsByUser failed (continuing)", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Room name encodes the service id so subscribers can verify the binding
  // server-side without a separate lookup table. Random suffix prevents
  // accidental cross-call subscription if a serwisant clicks twice.
  const roomName = `mp-service-${serviceId}-${shortId()}`;

  let publisherToken: string;
  let livekitUrl: string;
  try {
    await createRoom({
      name: roomName,
      // Auto-close the room 30 min after creation if no one ever joins (the
      // serwisant lost the QR or changed their mind). Once a publisher
      // connects LiveKit's `departure_timeout` takes over from the server
      // config, so this only governs the unjoined window.
      emptyTimeoutSec: 30 * 60,
      maxParticipants: 5,
      metadata: JSON.stringify({
        serviceId,
        ticketNumber: service.ticketNumber,
        requestedBy: user.email,
        createdAt: new Date().toISOString(),
      }),
    });
    publisherToken = await createPublisherToken({
      // Mobile identity — short, stable-per-room, distinguishable from
      // subscriber email identities in the participant list.
      identity: `mobile-${shortId(4)}`,
      roomName,
      ttlSec: 30 * 60,
      name: "Mobile (kamera)",
      metadata: JSON.stringify({ role: "publisher", serviceId }),
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
    logger.error("request-view failed", {
      serviceId,
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się uruchomić live view." },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }

  // Persist the lifecycle row. This is what the webhook handler joins
  // against to compute duration on `room_finished`. The unique index
  // re-enforces "max 1 active per user" against any race that slipped
  // past the pre-check above.
  try {
    await createSession({
      roomName,
      serviceId,
      requestedByEmail: user.email,
    });
  } catch (err) {
    if (err instanceof LiveKitSessionConflictError) {
      // Race won by a sibling request — return the same friendly 429.
      // The LiveKit room is already created; it will auto-close in 30 min
      // (`emptyTimeoutSec`) since neither side has joined yet.
      logger.info("livekit session conflict (race after pre-check)", {
        email: user.email,
        roomName,
      });
      return NextResponse.json(
        {
          error:
            "Masz już aktywną rozmowę. Zakończ ją przed rozpoczęciem nowej.",
        },
        { status: 429, headers: PANEL_CORS_HEADERS },
      );
    }
    // Any other DB error: log + continue. Webhook handler will still log
    // `live_view_ended` if it can find the row by room_name; if not, the
    // server-side LiveKit auto-close handles the resource. Better to ship
    // the QR than to leak a created room and a 502.
    logger.warn("createSession failed (continuing without persistence)", {
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const publisherUrl = buildPublisherUrl(roomName, publisherToken);

  let qrCodeDataUrl: string | null = null;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(publisherUrl, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
    });
  } catch (err) {
    // QR is a convenience — UI can fall back to the URL if generation
    // fails. We log a warning but still return 201 with the URL.
    logger.warn("QR generation failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

  void logServiceAction({
    serviceId,
    ticketNumber: service.ticketNumber,
    action: "live_view_started",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: "Rozpoczęto live view (kamera mobile)",
    payload: {
      roomName,
      expiresAt,
      requestedBy: user.email,
    },
  });

  logger.info("live view requested", {
    serviceId,
    roomName,
    requestedBy: user.email,
  });

  return NextResponse.json(
    {
      roomName,
      publisherUrl,
      qrCodeDataUrl,
      expiresAt,
      livekitUrl,
    },
    { status: 201, headers: PANEL_CORS_HEADERS },
  );
}
