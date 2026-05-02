import { NextResponse } from "next/server";
import { getService, SERVICE_STATUS_META, type ServiceStatus } from "@/lib/services";
import { corsHeaders, preflightResponse } from "@/lib/customer-portal/cors";
import { getCustomerPrincipal } from "@/lib/customer-portal/principal";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const logger = log.child({ module: "customer-portal-service-detail" });

export function OPTIONS(req: Request) {
  return preflightResponse(req);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cors = corsHeaders(req);
  const principal = getCustomerPrincipal(req);
  if (!principal) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: cors },
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: cors },
    );
  }

  let service;
  try {
    service = await getService(id);
  } catch (err) {
    logger.warn("getService failed", { err: String(err), id });
    return NextResponse.json(
      { error: "internal" },
      { status: 500, headers: cors },
    );
  }
  if (!service) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: cors },
    );
  }
  const ownerEmail = (service.contactEmail ?? "").trim().toLowerCase();
  if (ownerEmail !== principal.email.toLowerCase()) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: cors },
    );
  }

  const meta = SERVICE_STATUS_META[service.status as ServiceStatus] ?? null;

  // Privacy contract: OTP-bound principal dostaje skróconą wersję (bez IMEI,
  // bez zdjęć — full PII tylko dla zalogowanego konta KC w Faza 2).
  const isOtp = principal.mode === "otp";

  return NextResponse.json(
    {
      id: service.id,
      ticketNumber: service.ticketNumber,
      status: service.status,
      statusLabel: meta?.label ?? service.status,
      brand: service.brand,
      model: service.model,
      color: service.color,
      imei: isOtp ? null : service.imei,
      photos: isOtp ? [] : service.photos,
      amountEstimate: service.amountEstimate,
      amountFinal: service.amountFinal,
      diagnosis: service.diagnosis,
      description: service.description,
      promisedAt: service.promisedAt,
      warrantyUntil: service.warrantyUntil,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    },
    { status: 200, headers: cors },
  );
}
