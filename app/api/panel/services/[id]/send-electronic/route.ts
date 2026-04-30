export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import {
  autoSignAsEmployee,
  createDocumentForSigning,
  isDocumensoConfigured,
  resendDocumentReminder,
} from "@/lib/documenso";
import {
  renderReceiptPdfWithLayout,
  type ReceiptInput,
} from "@/lib/receipt-pdf";
import { getPricelistPriceByCode } from "@/lib/pricelist";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";
import { createHash } from "node:crypto";

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

  // Optional handover + force flag z query.
  const url = new URL(req.url);
  const handoverChoice =
    (url.searchParams.get("handover_choice") as "none" | "items" | null) ?? "none";
  const handoverItems = url.searchParams.get("handover_items") ?? "";
  const force = url.searchParams.get("force") === "true";

  const existing = service.visualCondition?.documenso;
  if (
    !force &&
    existing?.docId &&
    (existing.status === "sent" || existing.status === "signed")
  ) {
    return NextResponse.json(
      {
        error:
          existing.status === "signed"
            ? "Potwierdzenie zostało już podpisane. Aby wysłać aneks użyj force=true."
            : "Potwierdzenie zostało już wysłane do klienta. Aby wysłać ponownie użyj force=true.",
        documentId: existing.docId,
        status: existing.status,
      },
      { status: 409 },
    );
  }

  // Force resend gdy istnieje active sent doc — wysyłamy PRZYPOMNIENIE
  // (nie nowy dokument). Klient dostaje email z tym samym linkiem do
  // tego samego dokumentu, bez duplikatu w Documenso.
  if (force && existing?.docId && existing.status === "sent") {
    const ok = await resendDocumentReminder(existing.docId);
    if (ok) {
      void logServiceAction({
        serviceId: id,
        ticketNumber: service.ticketNumber,
        action: "resend_electronic",
        actor: {
          email: user.email,
          name: user.name?.trim() || user.preferred_username || user.email,
        },
        summary: `Wysłano przypomnienie do ${service.contactEmail} (dokument #${existing.docId})`,
        payload: { documentId: existing.docId, reminder: true },
      });
      return NextResponse.json(
        {
          ok: true,
          reminder: true,
          documentId: existing.docId,
        },
        { status: 200 },
      );
    }
    // Resend failed — fall through do utworzenia nowego doc.
    logger.warn("resendDocumentReminder failed, creating new doc", {
      docId: existing.docId,
    });
  }

  // Pracownik podpisuje przez Documenso typed signature (cursive font
  // generowany server-side przez Documenso — taki sam jak dla klienta).
  // Email pracownika UKRYTY przed klientem: używamy systemowego maila
  // serwis@caseownia.pl. Imię + nazwisko pracownika (z KC) widoczne jako
  // "name" recipienta i jako podpis (cursive). Documenso nie wysyła emaila
  // do tego adresu (sendEmail=false na send-document).
  const employeeDisplayName =
    user.name?.trim() || user.preferred_username || user.email;
  const SERVICE_SIGNER_EMAIL = "caseownia@zlecenieserwisowe.pl";

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
    const customerName =
      `${service.customerFirstName ?? ""} ${service.customerLastName ?? ""}`.trim() ||
      "Klient";

    // Sequential 2-recipient flow z sendEmail=false na `send`:
    //   1. Pracownik (signingOrder=1) — auto-signed przez autoSignAsEmployee
    //      (typed signature lub uploaded PNG z mp_user_signatures).
    //   2. Klient (signingOrder=2) — dostanie email DOPIERO po
    //      completeDocumentWithToken pracownika. Pracownik nie dostaje
    //      maila wcale (sendEmail=false na send-document).
    const result = await createDocumentForSigning({
      title: force
        ? `Potwierdzenie ${service.ticketNumber} — aktualizacja`
        : `Potwierdzenie ${service.ticketNumber}`,
      pdfBuffer: rendered.buffer,
      sendEmail: false,
      message: force
        ? "Aktualizacja potwierdzenia odbioru urządzenia po edycji warunków. Prosimy o podpis."
        : "Prosimy o podpisanie potwierdzenia odbioru urządzenia.",
      signers: [
        {
          name: employeeDisplayName,
          email: SERVICE_SIGNER_EMAIL,
          signatureBox: rendered.signatures.employee,
        },
        {
          name: customerName,
          email: service.contactEmail,
          signatureBox: rendered.signatures.customer,
        },
      ],
    });

    // Pracownik = signingOrder=1 = result.recipients[0]. Mapping po INDEKSIE
    // (nie po emailu) bo emaile mogą się powtarzać podczas testów.
    const employeeRecipient = result.recipients[0];
    let autoSignOk = false;
    if (employeeRecipient?.token) {
      // typed signature: value=name, isBase64=false → Documenso renderuje
      // cursive font (taki sam jak klient gdy wpisuje swoje imię w UI).
      const signRes = await autoSignAsEmployee({
        documentId: result.documentId,
        employeeToken: employeeRecipient.token,
        employeeFullName: employeeDisplayName,
        employeeRecipientId: employeeRecipient.id,
      });
      autoSignOk = signRes.ok;
      if (!signRes.ok) {
        // Fallback: ręcznie wyślij przypomnienie żeby klient i tak dostał email.
        logger.warn("autoSignAsEmployee failed — fallback resend reminder", {
          serviceId: id,
          docId: result.documentId,
          err: signRes.error,
        });
      }
    } else {
      logger.warn("brak tokena pracownika w odpowiedzi Documenso", {
        serviceId: id,
        docId: result.documentId,
      });
    }

    const employeeSigningUrl: string | null =
      result.signingUrls[0]?.url ?? null;

    const previousDocIds = (() => {
      const cur = service.visualCondition?.documenso;
      if (!cur?.docId) return [] as number[];
      return [...(cur.previousDocIds ?? []), cur.docId];
    })();

    try {
      await updateService(id, {
        visualCondition: {
          ...(service.visualCondition ?? {}),
          // Po new send: invalidacja employeeSignature (null = delete-key
          // przez mergeJsonb sentinel) — typed signature jest w Documenso,
          // nie embedujemy już PNG w naszym PDF.
          employeeSignature: null as unknown as undefined,
          documenso: {
            docId: result.documentId,
            // employee_signed gdy autoSign powiódł się (klient czeka),
            // sent gdy autoSign zawiódł (klient i tak dostanie po
            // SEQUENTIAL kolejce, tylko po podpisaniu pracownika).
            status: autoSignOk ? "employee_signed" : "sent",
            sentAt: new Date().toISOString(),
            ...(autoSignOk
              ? { employeeSignedAt: new Date().toISOString() }
              : {}),
            pdfHash,
            previousDocIds,
            employeeSigningUrl: employeeSigningUrl ?? undefined,
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
      force,
      pdfHash: pdfHash.slice(0, 16),
    });
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: force ? "resend_electronic" : "send_electronic",
      actor: {
        email: user.email,
        name: user.name?.trim() || user.preferred_username || user.email,
      },
      summary: force
        ? `Wysłano ponowne potwierdzenie do ${service.contactEmail}`
        : autoSignOk
          ? `Pracownik podpisał i wysłano potwierdzenie do ${service.contactEmail}`
          : `Wysłano potwierdzenie elektroniczne do ${service.contactEmail}`,
      payload: {
        documentId: result.documentId,
        pdfHash: pdfHash.slice(0, 16),
        recipientEmail: service.contactEmail,
        employeeAutoSigned: autoSignOk,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        documentId: result.documentId,
        signingUrls: result.signingUrls,
        employeeAutoSigned: autoSignOk,
        pdfHash,
        force,
      },
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
