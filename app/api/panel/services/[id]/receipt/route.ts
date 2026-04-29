export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { renderReceiptPdf, type ReceiptInput } from "@/lib/receipt-pdf";
import { getPricelistPriceByCode } from "@/lib/pricelist";

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
  const url = new URL(req.url);
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const service = await getService(id);
  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Handover: priorytet → query string (świeże dane z panel side po
  // creation), fallback → visualCondition.handover (persisted w DB),
  // ostatnia opcja → default "none".
  const persistedHandover = (
    service.visualCondition as
      | { handover?: { choice?: "none" | "items"; items?: string } }
      | null
      | undefined
  )?.handover;
  const handoverChoice =
    (url.searchParams.get("handover_choice") as "none" | "items" | null) ??
    persistedHandover?.choice ??
    "none";
  const handoverItems =
    url.searchParams.get("handover_items") ?? persistedHandover?.items ?? "";

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
    lock: {
      type: service.lockType ?? "none",
      code: service.lockCode ?? "",
    },
    description: service.description ?? "",
    visualCondition: {
      ...(service.visualCondition ?? {}),
      ...(service.intakeChecklist ?? {}),
      charging_current: service.chargingCurrent ?? undefined,
    },
    estimate:
      typeof service.amountEstimate === "number" ? service.amountEstimate : null,
    cleaningPrice: service.visualCondition?.cleaning_accepted
      ? await getPricelistPriceByCode("CLEANING_INTAKE", {
          brand: service.brand,
          model: service.model,
        })
      : null,
    cleaningAccepted: !!service.visualCondition?.cleaning_accepted,
    handover: { choice: handoverChoice, items: handoverItems },
  };

  try {
    const pdfBuffer = await renderReceiptPdf(data);
    console.log(
      `[receipt] PDF generated, size=${pdfBuffer.length} bytes for ${service.ticketNumber}`,
    );
    // Diag: zapisz ostatni PDF do /tmp żeby porównać z tym co browser dostaje.
    try {
      const fsLocal = await import("fs");
      fsLocal.writeFileSync("/tmp/last-receipt.pdf", pdfBuffer);
    } catch {
      /* ignore */
    }
    // Pass Buffer directly. Node Buffer is Uint8Array subclass; Next.js
    // Response w Node 22 obsługuje to natywnie bez Blob wrapper.
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfBuffer.length),
        "Content-Disposition": `inline; filename="Potwierdzenie-${service.ticketNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[receipt] PDF render failed:", err);
    if (err instanceof Error) {
      console.error("[receipt] stack:", err.stack);
    }
    return NextResponse.json(
      {
        error: "PDF render failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
