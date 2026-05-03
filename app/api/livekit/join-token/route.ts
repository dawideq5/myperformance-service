export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  LiveKitNotConfiguredError,
  createBrowserPublisherToken,
  createSubscriberToken,
  getLiveKitUrl,
  verifyJoinToken,
} from "@/lib/livekit";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

const logger = log.child({ module: "livekit-join-token" });

/**
 * GET /api/livekit/join-token?token=<signed-jwt>
 *
 * Public endpoint — auth via short-lived signed JWT (HS256, audience
 * `mp-consultation-join`, podpisany przez `LIVEKIT_API_SECRET`).
 *
 * Konsumowane przez `/konsultacja/<room>` page po stronie agenta Chatwoot.
 * Page server-side weryfikuje podpis tokena → wystawia subscriber token
 * do LiveKit (canSubscribe=true, canPublish=false, TTL 30 min) → klient
 * łączy się przez `livekit-client` SDK.
 *
 * Rate-limit per IP (60/min) — ten endpoint jest "public", więc bez auth.
 */
export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`livekit-join-token:${ip}`, {
    capacity: 60,
    refillPerSec: 1,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele zapytań — odczekaj chwilę." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const url = new URL(req.url);
  const signedToken = url.searchParams.get("token")?.trim() ?? "";
  // Wave 24 — `mode=publisher` daje canPublish=true (2-way video).
  // Default = subscriber dla backward compat z /konsultacja/[room] page.
  const mode = url.searchParams.get("mode")?.trim() === "publisher"
    ? "publisher"
    : "subscriber";
  if (!signedToken) {
    return NextResponse.json(
      { error: "Parametr `token` jest wymagany." },
      { status: 400 },
    );
  }

  let claims: { room: string; identity: string };
  try {
    claims = await verifyJoinToken(signedToken);
  } catch (err) {
    logger.info("join token rejected", {
      ip,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Link wygasł lub jest nieprawidłowy." },
      { status: 401 },
    );
  }

  let accessToken: string;
  let livekitUrl: string;
  try {
    const issuer =
      mode === "publisher" ? createBrowserPublisherToken : createSubscriberToken;
    accessToken = await issuer({
      identity: claims.identity,
      roomName: claims.room,
      ttlSec: 30 * 60,
      name: claims.identity,
      metadata: JSON.stringify({ role: mode, source: "chatwoot" }),
    });
    livekitUrl = getLiveKitUrl();
  } catch (err) {
    if (err instanceof LiveKitNotConfiguredError) {
      return NextResponse.json(
        { error: "Konsultacja video jest tymczasowo niedostępna." },
        { status: 503 },
      );
    }
    logger.error("subscriber token issue failed", {
      roomName: claims.room,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się dołączyć do konsultacji." },
      { status: 500 },
    );
  }

  logger.info("join-link access token issued", {
    roomName: claims.room,
    identity: claims.identity,
    mode,
  });

  return NextResponse.json({
    livekitUrl,
    accessToken,
    roomName: claims.room,
    identity: claims.identity,
    mode,
  });
}
