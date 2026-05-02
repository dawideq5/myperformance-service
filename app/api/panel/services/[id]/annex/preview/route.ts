export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { renderAnnexPdf, type AnnexInput } from "@/lib/annex-pdf";
import { rateLimit } from "@/lib/rate-limit";

/** Preview aneksu — render PDF on-the-fly bez zapisu w DB. Używany przez
 * `AnnexBuilder` w panelu serwisanta — pracownik klika "Podgląd PDF" zanim
 * wyśle aneks do podpisu. Endpoint NIE tworzy `mp_service_annexes` ani
 * `service_action`, NIE wysyła do Documenso. Cache: no-store. */

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

export async function GET(
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

  // Light rate limit — preview może być wywoływany on-blur z formularza,
  // ale nie chcemy DDoS PDF rendererem.
  const rl = rateLimit(`svc-annex-preview:${id}`, {
    capacity: 20,
    refillPerSec: 1,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — zbyt częste podglądy" },
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
  const deltaParam = url.searchParams.get("delta");
  const reason = (url.searchParams.get("reason") ?? "").trim();
  const customerSignerName =
    (url.searchParams.get("customerName") ?? "").trim() || undefined;

  const deltaAmount = deltaParam == null ? 0 : Number(deltaParam.replace(",", "."));
  if (!Number.isFinite(deltaAmount)) {
    return NextResponse.json(
      { error: "delta must be a number" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const editorName =
    user.name?.trim() || user.preferred_username || user.email;
  const originalAmount =
    typeof service.amountEstimate === "number" ? service.amountEstimate : 0;
  const newAmount = Number((originalAmount + deltaAmount).toFixed(2));
  const issuedAt = new Date().toISOString();

  const data: AnnexInput = {
    ticketNumber: service.ticketNumber ?? "—",
    serviceCreatedAt: service.createdAt ?? new Date().toISOString(),
    customer: {
      firstName: service.customerFirstName ?? "",
      lastName: service.customerLastName ?? "",
      phone: service.contactPhone ?? undefined,
      email: service.contactEmail ?? undefined,
    },
    device: {
      brand: service.brand ?? "",
      model: service.model ?? "",
      imei: service.imei ?? "",
      description: service.description ?? undefined,
    },
    editor: { name: editorName, email: user.email },
    pricing: {
      originalAmount,
      deltaAmount,
      newAmount,
    },
    customerSignerName,
    summary: reason || "(podgląd — wpisz powód aneksu)",
    signedAt: issuedAt,
    issuedAt,
  };

  try {
    const pdf = await renderAnnexPdf(data);
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        ...PANEL_CORS_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `inline; filename="aneks-podglad-${service.ticketNumber ?? id}.pdf"`,
        "Cache-Control": "no-store",
        // X-Annex-Preview header — front-end może rozpoznać że to preview,
        // a nie ostateczny PDF — np. dodać watermark w viewer overlay.
        "X-Annex-Preview": "1",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "PDF render failed", detail: String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
