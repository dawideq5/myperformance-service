export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { getOptionalEnv } from "@/lib/env";
import {
  LiveKitNotConfiguredError,
  buildJoinUrl,
  createMobilePublisherToken,
  createRoom,
  getLiveKitUrl,
  signJoinToken,
  verifyChatwootInitiateToken,
} from "@/lib/livekit";
import { buildMobilePublisherUrl, generateQrDataUrl } from "@/lib/livekit-mobile";
import {
  LiveKitSessionConflictError,
  createSession,
} from "@/lib/livekit-rooms";
import { sendPrivateNote } from "@/lib/chatwoot-customer";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import { getService } from "@/lib/services";

const logger = log.child({ module: "livekit-start-from-chatwoot-agent" });

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

function shortId(bytes = 5): string {
  return randomBytes(bytes).toString("base64url");
}

interface Body {
  initiateToken?: unknown;
  conversationId?: unknown;
  agentEmail?: unknown;
}

/**
 * POST /api/livekit/start-from-chatwoot-agent
 *
 * Wave 23 (overlay) — Chatwoot agent inicjuje konsultację video z poziomu
 * Dashboard App iframe. Auth = short-lived initiate token (HS256, audience
 * `mp-chatwoot-initiate`, TTL 5 min) wystawiony przy GET intake-snapshot.
 *
 * Token zawiera claim `serviceId` — agent nie może podstawić innego
 * service'u niż widzi w iframe.
 *
 * Flow analogiczny do POST /api/livekit/start-publisher, ale:
 *   - `requested_by_email` = `chatwoot:conv:<conversationId>` (namespace
 *     żeby nie kolidować z partial unique index "1 active per user" —
 *     każda Chatwoot conversation ma własny slot).
 *   - Brak ownership check po locationId (agent Chatwoot nie ma KC sesji).
 *   - Wstrzykuje PRIVATE NOTE do conversation z mobilePublisherUrl + linkiem
 *     subscriber dla agenta.
 *
 * Response: { roomName, mobilePublisherUrl, qrCodeDataUrl, joinUrl,
 *             joinToken, livekitUrl, expiresAt, chatwootMessageSent }
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`livekit-start-from-chatwoot:${ip}`, {
    capacity: 12,
    refillPerSec: 12 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele zapytań — odczekaj chwilę." },
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
  const conversationId =
    typeof body.conversationId === "number" &&
    Number.isFinite(body.conversationId)
      ? body.conversationId
      : null;
  const agentEmail =
    typeof body.agentEmail === "string" ? body.agentEmail.trim() : null;

  if (!initiateToken) {
    return NextResponse.json(
      { error: "Brak `initiateToken`. Odśwież iframe." },
      { status: 401, headers: CORS_HEADERS },
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

  // Wave 24 — token może być zakotwiczony albo na serviceId (existing
  // service) albo na conversationId (draft, brak service jeszcze). Jeśli
  // mamy serviceId — weryfikujemy że istnieje i bierzemy z niego conv id
  // jako fallback. Jeśli tylko conv id — przelatujemy bez service.
  let service: Awaited<ReturnType<typeof getService>> | null = null;
  if (claimedServiceId) {
    service = await getService(claimedServiceId);
    if (!service) {
      return NextResponse.json(
        { error: "Service not found" },
        { status: 404, headers: CORS_HEADERS },
      );
    }
  }
  const effectiveConvId =
    conversationId ??
    service?.chatwootConversationId ??
    claimedConversationId ??
    null;

  if (!service && effectiveConvId == null) {
    // Token nie miał ani serviceId ani conversationId — `verifyChatwootInitiateToken`
    // nie powinien w ogóle takiego przepuścić, ale bezpiecznie sprawdzamy.
    return NextResponse.json(
      { error: "Token nie zawiera kontekstu konwersacji ani zlecenia." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Namespace per-conversation żeby unique index "1 active per user"
  // nie kolidował z aktywną sesją sprzedawcy o tym samym email'u.
  // Bez conversationId — bezpieczna fallback per-service.
  const requestedBy = effectiveConvId
    ? `chatwoot:conv:${effectiveConvId}`
    : `chatwoot:service:${claimedServiceId}`;

  const roomName = `mp-consultation-${shortId(6)}`;
  const mobileIdentity = `mobile-${shortId(4)}`;

  let mobilePublisherToken: string;
  let mobilePublisherUrl: string;
  let qrCodeDataUrl: string;
  let joinToken: string;
  let livekitUrl: string;
  try {
    await createRoom({
      name: roomName,
      emptyTimeoutSec: 30 * 60,
      maxParticipants: 5,
      metadata: JSON.stringify({
        kind: "consultation",
        serviceId: service?.id ?? null,
        chatwootConversationId: effectiveConvId,
        requestedBy,
        agentEmail,
        createdAt: new Date().toISOString(),
      }),
    });
    mobilePublisherToken = await createMobilePublisherToken({
      identity: mobileIdentity,
      roomName,
      ttlSec: 30 * 60,
      name: "Mobile (klient)",
      metadata: JSON.stringify({
        role: "mobile-publisher",
        serviceId: service?.id ?? null,
      }),
    });
    mobilePublisherUrl = buildMobilePublisherUrl(roomName, mobilePublisherToken);
    qrCodeDataUrl = await generateQrDataUrl(mobilePublisherUrl);
    joinToken = await signJoinToken({
      roomName,
      identity: agentEmail
        ? `Agent Chatwoot (${agentEmail})`
        : "Agent Chatwoot",
      ttlSec: 30 * 60,
    });
    livekitUrl = getLiveKitUrl();
  } catch (err) {
    if (err instanceof LiveKitNotConfiguredError) {
      logger.warn("LiveKit not configured", { err: err.message });
      return NextResponse.json(
        { error: "Konsultacja video jest tymczasowo niedostępna." },
        { status: 503, headers: CORS_HEADERS },
      );
    }
    logger.error("start-from-chatwoot-agent failed", {
      roomName,
      claimedServiceId,
      claimedConversationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się rozpocząć konsultacji." },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  try {
    await createSession({
      roomName,
      serviceId: service?.id ?? null,
      chatwootConversationId: effectiveConvId,
      requestedByEmail: requestedBy,
    });
  } catch (err) {
    if (err instanceof LiveKitSessionConflictError) {
      return NextResponse.json(
        {
          error:
            "Dla tej rozmowy istnieje już aktywna konsultacja. Zakończ ją przed rozpoczęciem nowej.",
        },
        { status: 429, headers: CORS_HEADERS },
      );
    }
    logger.warn("createSession failed (continuing without persistence)", {
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const joinUrl = buildJoinUrl(APP_BASE, roomName, joinToken);

  let chatwootMessageSent = false;
  if (effectiveConvId) {
    const ok = await sendPrivateNote(
      effectiveConvId,
      `🎥 Konsultacja video (zainicjowana przez agenta${
        agentEmail ? ` ${agentEmail}` : ""
      }):\n\n` +
        `📱 Mobile (do skanu QR / kliknięcia z telefonu klienta):\n${mobilePublisherUrl}\n\n` +
        `🖥 Dołącz jako uczestnik (subscriber):\n${joinUrl}\n\n` +
        `Linki wygasają za 30 minut.`,
    );
    chatwootMessageSent = ok;
  }

  if (service) {
    void logServiceAction({
      serviceId: service.id,
      action: "live_view_started",
      actor: {
        email: requestedBy,
        name: agentEmail
          ? `Agent Chatwoot (${agentEmail})`
          : "Agent Chatwoot",
      },
      summary: "Rozpoczęto konsultację video (z Chatwoot)",
      payload: {
        roomName,
        chatwootConversationId: effectiveConvId,
        chatwootMessageSent,
      },
    });
  }

  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

  logger.info("consultation started from chatwoot agent", {
    roomName,
    serviceId: claimedServiceId,
    conversationId: effectiveConvId,
    requestedBy,
    chatwootMessageSent,
  });

  return NextResponse.json(
    {
      roomName,
      mobilePublisherUrl,
      qrCodeDataUrl,
      livekitUrl,
      joinUrl,
      joinToken,
      chatwootMessageSent,
      expiresAt,
    },
    { status: 201, headers: CORS_HEADERS },
  );
}
