export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getService } from "@/lib/services";

const logger = log.child({ module: "livekit-intake-snapshot" });

/**
 * GET /api/livekit/intake-snapshot?service_id=<uuid>
 *
 * Wave 23 — public read-only endpoint dla Chatwoot Dashboard App. Agent
 * obsługujący conversation widzi w iframe live preview formularza intake
 * (sprzedawca edytuje real-time). Endpoint jest publiczny (bez KC SSO),
 * bo chatwoot agent nie ma sesji w MyPerformance.
 *
 * Zwraca tylko nieczułe pola (klient, urządzenie, opis, wycena) — bez
 * lock_code i innych wrażliwych. Polling co 3-5s wystarcza dla UX
 * "zmiana pojawia się prawie od razu" — w przyszłości można podpiąć SSE.
 *
 * Rate-limit: 30 req/min per IP. Service id musi być znanym UUID — endpoint
 * 404 dla nieistniejących, więc enumeration koszt = same jak guess UUID.
 */
export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`livekit-intake-snapshot:${ip}`, {
    capacity: 30,
    refillPerSec: 30 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele zapytań." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const url = new URL(req.url);
  const serviceId = url.searchParams.get("service_id")?.trim() ?? "";
  if (!serviceId) {
    return NextResponse.json(
      { error: "Parametr `service_id` jest wymagany." },
      { status: 400 },
    );
  }

  const service = await getService(serviceId);
  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // CORS — chatwoot agent iframe załadowany z chat.myperformance.pl
  // robi fetch do myperformance.pl. Pozwalamy bo response to read-only
  // sanitized snapshot.
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };

  const sanitized = {
    id: service.id,
    ticketNumber: service.ticketNumber,
    status: service.status,
    brand: service.brand,
    model: service.model,
    imei: service.imei,
    color: service.color,
    lockType: service.lockType,
    description: service.description,
    diagnosis: service.diagnosis,
    amountEstimate: service.amountEstimate,
    amountFinal: service.amountFinal,
    customerFirstName: service.customerFirstName,
    customerLastName: service.customerLastName,
    contactPhone: service.contactPhone,
    contactEmail: service.contactEmail,
    receivedBy: service.receivedBy,
    chatwootConversationId: service.chatwootConversationId,
    updatedAt: service.updatedAt,
    createdAt: service.createdAt,
    visualCondition: service.visualCondition,
    intakeChecklist: service.intakeChecklist,
  };

  logger.info("intake snapshot served", {
    serviceId,
    ticketNumber: service.ticketNumber,
  });

  return new NextResponse(JSON.stringify({ service: sanitized }), {
    status: 200,
    headers: corsHeaders,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}
