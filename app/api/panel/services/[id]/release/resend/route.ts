export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import { rateLimit } from "@/lib/rate-limit";
import {
  resendReleaseCode,
  markReleaseCodeSent,
} from "@/lib/service-release-codes";
import { notifyReleaseCode } from "@/lib/services/notify-release-code";
import { publish } from "@/lib/sse-bus";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-release-resend" });

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
  ) {
    return true;
  }
  return false;
}

interface ResendBody {
  channel?: "email" | "sms";
}

/** POST: regeneruje kod (nowy salt+hash, stary kod invalid) i wysyła
 * wybranym kanałem. Default: email gdy `contactEmail`, fallback sms. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id } = await params;
  const service = await getService(id);
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

  const rl = rateLimit(`svc-release-resend:${id}`, {
    capacity: 3,
    refillPerSec: 3 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele wysyłek. Spróbuj za chwilę." },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as ResendBody | null;
  const requestedChannel = body?.channel;
  // Auto-fallback gdy nie podano channel.
  const channel: "email" | "sms" =
    requestedChannel ??
    (service.contactEmail ? "email" : service.contactPhone ? "sms" : "email");

  if (channel === "email" && !service.contactEmail) {
    return NextResponse.json(
      { error: "Brak adresu email klienta — wybierz SMS lub uzupełnij email." },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (channel === "sms" && !service.contactPhone) {
    return NextResponse.json(
      { error: "Brak numeru telefonu klienta — wybierz email." },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const gen = await resendReleaseCode(id, service.ticketNumber);
  if (!gen) {
    return NextResponse.json(
      { error: "Nie udało się wygenerować kodu (Directus niedostępny)." },
      { status: 503, headers: PANEL_CORS_HEADERS },
    );
  }

  const notifyResult = await notifyReleaseCode({
    service: {
      id,
      ticketNumber: service.ticketNumber,
      contactEmail: service.contactEmail,
      contactPhone: service.contactPhone,
      customerFirstName: service.customerFirstName,
      customerLastName: service.customerLastName,
      chatwootConversationId: service.chatwootConversationId,
    },
    code: gen.code,
    channel,
  });

  if (!notifyResult.ok) {
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "release_code_failed",
      actor: { email: user.email, name: user.name ?? user.email },
      summary: `Nie udało się wysłać kodu wydania kanałem ${channel}.`,
      payload: { channel, error: notifyResult.error ?? null },
    });
    logger.warn("release-code resend notify failed", {
      serviceId: id,
      channel,
      err: notifyResult.error,
    });
    return NextResponse.json(
      {
        error: "Nie udało się wysłać kodu.",
        detail: notifyResult.error ?? null,
      },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }

  await markReleaseCodeSent({ serviceId: id, channel });

  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "release_code_resent",
    actor: { email: user.email, name: user.name ?? user.email },
    summary: `Wysłano ponownie kod wydania (${channel}).`,
    payload: { channel },
  });

  publish({
    type: "release_code_sent",
    serviceId: id,
    payload: { channel, ticketNumber: service.ticketNumber },
  });

  return NextResponse.json(
    { ok: true, channel },
    { headers: PANEL_CORS_HEADERS },
  );
}
