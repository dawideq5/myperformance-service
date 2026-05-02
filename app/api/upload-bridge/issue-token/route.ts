export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { rateLimit } from "@/lib/rate-limit";
import {
  buildUploadBridgeUrl,
  signUploadToken,
} from "@/lib/upload-bridge";
import type { ServicePhotoStage } from "@/lib/service-photos";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "upload-bridge-issue" });

const ALLOWED_STAGES: ServicePhotoStage[] = [
  "intake",
  "diagnosis",
  "in_repair",
  "before_delivery",
  "other",
];

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

export async function POST(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }

  // Rate-limit token issuance per user — 12 tokens / minute is plenty for a
  // serwisant flipping between stages and resending QR codes.
  const rl = rateLimit(`upload-bridge-issue:${user.email}`, {
    capacity: 12,
    refillPerSec: 12 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele tokenów — odczekaj chwilę." },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: { serviceId?: unknown; stage?: unknown };
  try {
    body = (await req.json()) as { serviceId?: unknown; stage?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Oczekiwano JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const serviceId =
    typeof body.serviceId === "string" ? body.serviceId.trim() : "";
  const stageRaw = typeof body.stage === "string" ? body.stage : "intake";
  if (!serviceId) {
    return NextResponse.json(
      { error: "Pole `serviceId` jest wymagane." },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!(ALLOWED_STAGES as string[]).includes(stageRaw)) {
    return NextResponse.json(
      {
        error: `Niepoprawna wartość stage. Dozwolone: ${ALLOWED_STAGES.join(", ")}`,
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const stage = stageRaw as ServicePhotoStage;

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

  let signed: ReturnType<typeof signUploadToken>;
  try {
    signed = signUploadToken({
      serviceId,
      stage,
      uploadedByEmail: user.email,
      ticketNumber: service.ticketNumber,
    });
  } catch (err) {
    logger.error("issue token failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się wygenerować tokenu (brak konfiguracji?)." },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  void logServiceAction({
    serviceId,
    ticketNumber: service.ticketNumber,
    action: "upload_bridge_token_issued",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: `Wystawiono token upload (mobile, etap ${stage})`,
    payload: {
      stage,
      expiresAt: signed.expiresAt,
    },
  });

  return NextResponse.json(
    {
      token: signed.token,
      url: buildUploadBridgeUrl(signed.token),
      expiresAt: signed.expiresAt,
      stage,
      serviceId,
      ticketNumber: service.ticketNumber,
    },
    { status: 201, headers: PANEL_CORS_HEADERS },
  );
}
