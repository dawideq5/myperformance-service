export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { downloadDocumentPdf } from "@/lib/documenso";
import { renderReceiptPdf, type ReceiptInput } from "@/lib/receipt-pdf";
import { getPricelistPriceByCode } from "@/lib/pricelist";
import { getUserSignature } from "@/lib/user-signatures";

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

  const docInfo = service.visualCondition?.documenso;
  const status = docInfo?.status;

  // Paper-flow: renderuj lokalnie PDF z embed cursive PNG pracownika.
  // Klient podpisuje na wydrukowanym PDF (nie wymaga Documenso).
  if (status === "paper_pending" || status === "paper_signed") {
    const employeeName =
      user.name?.trim() || user.preferred_username || user.email;
    const sig = await getUserSignature(user.email);
    const employeeSignaturePng = sig?.pngDataUrl ?? null;
    const persistedHandover = service.visualCondition?.handover;
    const data: ReceiptInput = {
      ticketNumber: service.ticketNumber ?? "—",
      createdAt: service.createdAt ?? new Date().toISOString(),
      customer: {
        firstName: service.customerFirstName ?? "",
        lastName: service.customerLastName ?? "",
        phone: service.contactPhone ?? "",
        email: service.contactEmail ?? "",
      },
      device: {
        brand: service.brand ?? "",
        model: service.model ?? "",
        imei: service.imei ?? "",
        color: service.color ?? "",
      },
      lock: { type: service.lockType ?? "none", code: service.lockCode ?? "" },
      description: service.description ?? "",
      employeeName,
      employeeSignaturePng,
      visualCondition: {
        ...(service.visualCondition ?? {}),
        ...(service.intakeChecklist ?? {}),
        charging_current: service.chargingCurrent ?? undefined,
      },
      estimate:
        typeof service.amountEstimate === "number"
          ? service.amountEstimate
          : null,
      cleaningPrice: service.visualCondition?.cleaning_accepted
        ? await getPricelistPriceByCode("CLEANING_INTAKE", {
            brand: service.brand,
            model: service.model,
          })
        : null,
      cleaningAccepted: !!service.visualCondition?.cleaning_accepted,
      handover: {
        choice: persistedHandover?.choice ?? "none",
        items: persistedHandover?.items ?? "",
      },
    };
    const pdfBuffer = await renderReceiptPdf(data);
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Potwierdzenie-${service.ticketNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Elektroniczne — pobierz podpisany PDF z Documenso (po DOCUMENT_COMPLETED).
  const docId = docInfo?.docId;
  if (!docId) {
    return NextResponse.json(
      { error: "Brak dokumentu Documenso powiązanego z zleceniem" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (status !== "signed") {
    return NextResponse.json(
      {
        error:
          "Dokument nie został jeszcze podpisany przez wszystkie strony.",
      },
      { status: 425, headers: PANEL_CORS_HEADERS },
    );
  }
  const dl = await downloadDocumentPdf(Number(docId));
  if (!dl.ok) {
    return NextResponse.json(
      { error: `Nie udało się pobrać podpisanego dokumentu (${dl.status})` },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }
  const ab = await dl.arrayBuffer();
  return new NextResponse(ab as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Potwierdzenie-podpisane-${service.ticketNumber}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
