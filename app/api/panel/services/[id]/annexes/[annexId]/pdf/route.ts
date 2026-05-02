export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { getServiceAnnex } from "@/lib/service-annexes";
import { renderAnnexPdf, type AnnexInput } from "@/lib/annex-pdf";

/** GET PDF dla istniejącego aneksu — używa snapshot delta+reason z DB
 * (mp_service_annexes), nie wywoła Documenso. Dla aneksów Documenso które
 * zostały już zaakceptowane Front-end powinien pobierać podpisany PDF
 * bezpośrednio z Documenso (audit trail), ale ten endpoint zawsze
 * regeneruje na bazie persisted state — przydatne do wglądu/wydruku w
 * panelu serwisanta. */

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
  { params }: { params: Promise<{ id: string; annexId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, annexId } = await params;
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
  const annex = await getServiceAnnex(annexId);
  if (!annex || annex.serviceId !== id) {
    return NextResponse.json(
      { error: "Annex not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }

  // Liczymy oryginalną kwotę: jeśli aneks zaakceptowany — bieżąca minus
  // delta (delta została już applyowana). Dla pending — bieżąca to
  // jednocześnie pierwotna (delta jeszcze nie zaapplyowana).
  const currentAmount =
    typeof service.amountEstimate === "number" ? service.amountEstimate : 0;
  const originalAmount =
    annex.acceptanceStatus === "accepted"
      ? Number((currentAmount - annex.deltaAmount).toFixed(2))
      : currentAmount;
  const newAmount = Number((originalAmount + annex.deltaAmount).toFixed(2));

  const editorName =
    annex.createdByName?.trim() ||
    annex.createdByEmail ||
    user.name?.trim() ||
    user.email;
  const editorEmail = annex.createdByEmail ?? user.email;

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
    editor: { name: editorName, email: editorEmail },
    pricing: { originalAmount, deltaAmount: annex.deltaAmount, newAmount },
    customerSignerName: annex.customerName ?? undefined,
    summary: annex.reason,
    signedAt: annex.acceptedAt ?? annex.createdAt,
    issuedAt: annex.createdAt,
  };

  try {
    const pdf = await renderAnnexPdf(data);
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        ...PANEL_CORS_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `inline; filename="aneks-${service.ticketNumber ?? id}-${annexId.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "PDF render failed", detail: String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
