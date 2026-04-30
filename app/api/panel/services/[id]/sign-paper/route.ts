export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import {
  autoSignAsEmployee,
  createDocumentForSigning,
  isDocumensoConfigured,
} from "@/lib/documenso";
import {
  renderReceiptPdfWithLayout,
  type ReceiptInput,
} from "@/lib/receipt-pdf";
import { getPricelistPriceByCode } from "@/lib/pricelist";
import { logServiceAction } from "@/lib/service-actions";
import { getUserSignature } from "@/lib/user-signatures";
import { log } from "@/lib/logger";
import { createHash } from "node:crypto";

const logger = log.child({ module: "sign-paper" });

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

/** Wersja papierowa: tworzy dokument Documenso z 1 recipientem (pracownik),
 * auto-podpisuje go, dokument staje się COMPLETED (single-signer). Klient
 * podpisze ręcznie na wydruku, potem klik "Podpisano" oznaczy stan
 * paperSigned. Documenso przechowuje audit log + signed PDF z podpisem
 * pracownika. */
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
  if (!isDocumensoConfigured()) {
    return NextResponse.json(
      { error: "Documenso nie jest skonfigurowane" },
      { status: 503, headers: PANEL_CORS_HEADERS },
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

  const url = new URL(req.url);
  const handoverChoice =
    (url.searchParams.get("handover_choice") as "none" | "items" | null) ?? "none";
  const handoverItems = url.searchParams.get("handover_items") ?? "";

  const existing = service.visualCondition?.documenso;
  if (existing?.docId) {
    return NextResponse.json(
      {
        error:
          "Istnieje już dokument — najpierw unieważnij obecny aby utworzyć nowy.",
        documentId: existing.docId,
        status: existing.status,
      },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }

  const employeeDisplayName =
    user.name?.trim() || user.preferred_username || user.email;
  const employeeSig = await getUserSignature(user.email);
  // Documenso v3 (skia-canvas) wymaga PEŁNEGO data URL z prefix
  // `data:image/png;base64,...`.
  const employeeSignaturePngBase64 = employeeSig?.pngDataUrl ?? undefined;

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
    employeeName: employeeDisplayName,
    employeeSignaturePng: null,
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
    const pdfHash = createHash("sha256").update(rendered.buffer).digest("hex");

    // Single-signer flow: tylko pracownik podpisuje przez Documenso.
    // Klient podpisze ręcznie na wydrukowanym PDF.
    const result = await createDocumentForSigning({
      title: `Potwierdzenie ${service.ticketNumber} (papierowe)`,
      pdfBuffer: rendered.buffer,
      sendEmail: false,
      message:
        "Wewnętrzny dokument — podpis pracownika do druku. Klient podpisuje na wydruku.",
      signers: [
        {
          name: employeeDisplayName,
          email: user.email,
          signatureBox: rendered.signatures.employee,
        },
      ],
    });

    const employeeRecipient = result.recipients[0];
    if (!employeeRecipient?.token) {
      return NextResponse.json(
        { error: "Documenso nie zwrócił tokena pracownika" },
        { status: 502, headers: PANEL_CORS_HEADERS },
      );
    }

    const signRes = await autoSignAsEmployee({
      documentId: result.documentId,
      employeeToken: employeeRecipient.token,
      employeeFullName: employeeDisplayName,
      employeeRecipientId: employeeRecipient.id,
      employeeSignaturePngBase64,
    });
    if (!signRes.ok) {
      return NextResponse.json(
        {
          error: "Auto-podpis pracownika nie powiódł się",
          detail: signRes.error,
        },
        { status: 502, headers: PANEL_CORS_HEADERS },
      );
    }

    try {
      await updateService(id, {
        visualCondition: {
          ...(service.visualCondition ?? {}),
          employeeSignature: null as unknown as undefined,
          documenso: {
            docId: result.documentId,
            // paper_pending = pracownik podpisał elektronicznie, czeka na
            // podpis klienta na wydruku. Przejdzie w paper_signed po
            // kliknięciu Podpisano.
            status: "paper_pending",
            sentAt: new Date().toISOString(),
            employeeSignedAt: new Date().toISOString(),
            pdfHash,
            previousDocIds: [],
            // Document COMPLETED bo single signer = signed PDF dostępny.
            signedPdfUrl: "available",
          },
        } as typeof service.visualCondition,
      });
    } catch (e) {
      logger.warn("paper-flow status persist failed", {
        serviceId: id,
        err: e instanceof Error ? e.message : String(e),
      });
    }

    logger.info("paper flow document signed by employee", {
      serviceId: id,
      ticket: service.ticketNumber,
      documensoDocId: result.documentId,
      pdfHash: pdfHash.slice(0, 16),
    });
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "employee_sign",
      actor: {
        email: user.email,
        name: employeeDisplayName,
      },
      summary: `Pracownik podpisał elektronicznie wersję papierową #${result.documentId}`,
      payload: {
        documentId: result.documentId,
        pdfHash: pdfHash.slice(0, 16),
        flow: "paper",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        documentId: result.documentId,
        signedPdfUrl: `/api/relay/services/${encodeURIComponent(id)}/signed-pdf`,
        pdfHash,
      },
      { status: 200, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("sign-paper failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: "Utworzenie dokumentu papierowego nie powiodło się",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
