export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import {
  createDocumentForSigning,
  isDocumensoConfigured,
} from "@/lib/documenso";
import {
  renderReceiptPdfWithLayout,
  type ReceiptInput,
} from "@/lib/receipt-pdf";
import { getPricelistPriceByCode } from "@/lib/pricelist";
import { log } from "@/lib/logger";

const logger = log.child({ module: "send-electronic" });

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDocumensoConfigured()) {
    return NextResponse.json(
      { error: "Documenso nie jest skonfigurowane (DOCUMENSO_URL + DOCUMENSO_API_KEY)" },
      { status: 503 },
    );
  }
  const { id } = await params;
  const service = await getService(id);
  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!service.contactEmail) {
    return NextResponse.json(
      { error: "Email klienta jest wymagany dla potwierdzenia elektronicznego" },
      { status: 400 },
    );
  }

  const existing = service.visualCondition?.documenso;
  if (existing?.docId && (existing.status === "sent" || existing.status === "signed")) {
    return NextResponse.json(
      {
        error:
          existing.status === "signed"
            ? "Potwierdzenie zostało już podpisane przez klienta"
            : "Potwierdzenie zostało już wysłane do klienta. Poczekaj na podpis lub anuluj i wyślij ponownie.",
        documentId: existing.docId,
        status: existing.status,
      },
      { status: 409 },
    );
  }

  // Optional handover from query (panel passes z lokalnej pamięci).
  const url = new URL(req.url);
  const handoverChoice =
    (url.searchParams.get("handover_choice") as "none" | "items" | null) ?? "none";
  const handoverItems = url.searchParams.get("handover_items") ?? "";

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
    const rendered = await renderReceiptPdfWithLayout(data);
    const employeeName = user.name?.trim() || user.preferred_username || user.email;
    const customerName =
      `${service.customerFirstName ?? ""} ${service.customerLastName ?? ""}`.trim() ||
      "Klient";

    const result = await createDocumentForSigning({
      title: `Potwierdzenie ${service.ticketNumber}`,
      pdfBuffer: rendered.buffer,
      signers: [
        {
          name: employeeName,
          email: user.email,
          signatureBox: rendered.signatures.employee,
        },
        {
          name: customerName,
          email: service.contactEmail,
          signatureBox: rendered.signatures.customer,
        },
      ],
    });

    // Persist documenso status do service.visualCondition.documenso —
    // bez schema migration. Frontend czyta status na refresh listy.
    try {
      await updateService(id, {
        visualCondition: {
          ...(service.visualCondition ?? {}),
          documenso: {
            docId: result.documentId,
            status: "sent",
            sentAt: new Date().toISOString(),
          },
        } as typeof service.visualCondition,
      });
    } catch (e) {
      logger.warn("documenso status persist failed", {
        serviceId: id,
        err: e instanceof Error ? e.message : String(e),
      });
    }

    logger.info("electronic confirmation sent", {
      serviceId: id,
      ticket: service.ticketNumber,
      documensoDocId: result.documentId,
    });

    return NextResponse.json(
      { ok: true, documentId: result.documentId, signingUrls: result.signingUrls },
      { status: 200 },
    );
  } catch (err) {
    logger.error("send-electronic failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: "Wysłanie potwierdzenia elektronicznego nie powiodło się",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
