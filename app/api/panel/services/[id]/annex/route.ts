export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { listServiceRevisions } from "@/lib/service-revisions";
import { renderAnnexPdf, type AnnexInput } from "@/lib/annex-pdf";
import { logServiceAction } from "@/lib/service-actions";
import { rateLimit } from "@/lib/rate-limit";
import {
  createServiceAnnex,
  type AnnexAcceptanceMethod,
} from "@/lib/service-annexes";
import {
  autoSignAsEmployee,
  createDocumentForSigning,
  isDocumensoConfigured,
} from "@/lib/documenso";
import { getServiceSignerEmail } from "@/lib/service-config";
import { createHash } from "node:crypto";
import { log } from "@/lib/logger";
import { notifyAnnexCreated } from "@/lib/services/notify-annex";

const annexLogger = log.child({ module: "panel-services-annex-create" });

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

const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  diagnosis: "Diagnoza",
  amountEstimate: "Kwota wyceny",
  amountFinal: "Kwota finalna",
  promisedAt: "Obiecana data",
  warrantyUntil: "Gwarancja do",
  customerFirstName: "Imię klienta",
  customerLastName: "Nazwisko klienta",
  contactPhone: "Telefon",
  contactEmail: "Email",
  brand: "Marka",
  model: "Model",
  imei: "IMEI",
  color: "Kolor",
  lockType: "Typ blokady",
  visualCondition: "Stan wizualny",
  intakeChecklist: "Checklist przyjęcia",
};

function fmtValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 77) + "…" : v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Tak" : "Nie";
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + "…" : s;
  } catch {
    return String(v);
  }
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

  const revisions = await listServiceRevisions(id, 50);
  // Bierzemy zmiany od ostatniego potwierdzenia (Documenso) lub od początku.
  const documensoSentAt = service.visualCondition?.documenso?.sentAt;
  const cutoff = documensoSentAt ? new Date(documensoSentAt).getTime() : 0;
  const significantRevs = revisions.filter(
    (r) => r.isSignificant && new Date(r.createdAt).getTime() > cutoff,
  );

  if (significantRevs.length === 0) {
    return NextResponse.json(
      { error: "Brak zmian wymagających aneksu od ostatniego potwierdzenia" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // Zbierz changes ze wszystkich significant revisions, deduplikuj po polu
  // (najnowsza wartość wygrywa).
  const merged = new Map<string, { before: unknown; after: unknown }>();
  for (const rev of [...significantRevs].reverse()) {
    for (const [field, ch] of Object.entries(rev.changes)) {
      if (!merged.has(field)) merged.set(field, { before: ch.before, after: ch.after });
      else merged.set(field, { before: merged.get(field)!.before, after: ch.after });
    }
  }

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
    editor: {
      name: user.name?.trim() || user.preferred_username || user.email,
      email: user.email,
    },
    changes: Array.from(merged.entries()).map(([field, ch]) => ({
      field: FIELD_LABEL[field] ?? field,
      before: fmtValue(ch.before),
      after: fmtValue(ch.after),
    })),
    summary: significantRevs[0]?.summary ?? "Zmiany w warunkach zlecenia.",
    issuedAt: new Date().toISOString(),
  };

  const pdf = await renderAnnexPdf(data);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      ...PANEL_CORS_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="aneks-${service.ticketNumber ?? id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

interface AnnexCreateBody {
  deltaAmount: number;
  reason: string;
  acceptanceMethod: AnnexAcceptanceMethod;
  customerName?: string;
  messageId?: string;
  conversationId?: number;
  note?: string;
}

/** POST: tworzy nowy aneks (mp_service_annexes) — wycenowy delta + metoda
 * akceptacji. Dla `documenso` od razu generuje PDF, wysyła do podpisu i
 * zapisuje doc id; dla `phone`/`email` aneks wraca w stanie pending i
 * czeka na manual accept przez `/annexes/[annexId]/accept`. Rate limit
 * 3/min per service. */
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

  const rl = rateLimit(`svc-annex-create:${id}`, {
    capacity: 3,
    refillPerSec: 3 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — maks 3 aneksy / minutę na zlecenie" },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as AnnexCreateBody | null;
  if (
    !body ||
    typeof body.deltaAmount !== "number" ||
    !Number.isFinite(body.deltaAmount) ||
    !body.reason?.trim() ||
    !["documenso", "phone", "email"].includes(body.acceptanceMethod ?? "")
  ) {
    return NextResponse.json(
      {
        error:
          "Wymagane pola: deltaAmount (number), reason (string), acceptanceMethod (documenso|phone|email)",
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const editorName =
    user.name?.trim() || user.preferred_username || user.email;
  const customerName =
    body.customerName?.trim() ||
    `${service.customerFirstName ?? ""} ${service.customerLastName ?? ""}`.trim() ||
    "Klient";

  // Documenso path: render PDF → upload → SEND with autoSign as employee.
  if (body.acceptanceMethod === "documenso") {
    if (!isDocumensoConfigured()) {
      return NextResponse.json(
        {
          error:
            "Documenso nie jest skonfigurowane (DOCUMENSO_URL + DOCUMENSO_API_KEY)",
        },
        { status: 503, headers: PANEL_CORS_HEADERS },
      );
    }
    if (!service.contactEmail) {
      return NextResponse.json(
        { error: "Email klienta jest wymagany dla aneksu Documenso" },
        { status: 400, headers: PANEL_CORS_HEADERS },
      );
    }

    try {
      const originalAmount =
        typeof service.amountEstimate === "number" ? service.amountEstimate : 0;
      const newAmount = Number((originalAmount + body.deltaAmount).toFixed(2));
      const issuedAt = new Date().toISOString();
      const annexInput: AnnexInput = {
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
          deltaAmount: body.deltaAmount,
          newAmount,
        },
        customerSignerName: customerName,
        summary: body.reason,
        signedAt: issuedAt,
        issuedAt,
      };
      const pdfBuffer = await renderAnnexPdf(annexInput);
      const pdfHash = createHash("sha256").update(pdfBuffer).digest("hex");

      const SIGNER_EMAIL = getServiceSignerEmail();
      const result = await createDocumentForSigning({
        title: `Aneks ${service.ticketNumber} (Δ ${body.deltaAmount} PLN)`,
        pdfBuffer,
        sendEmail: false,
        message:
          "Prosimy o akceptację aneksu do zlecenia serwisowego (zmiana wyceny).",
        signers: [
          {
            name: editorName,
            email: SIGNER_EMAIL,
          },
          {
            name: customerName,
            email: service.contactEmail,
          },
        ],
      });

      // Auto-sign jako pracownik (1szy w SEQUENTIAL flow), żeby klient
      // dostał maila od razu. Failure = klient i tak otrzyma email po
      // signFieldWithToken w manual flow.
      const employeeRecipient = result.recipients[0];
      if (employeeRecipient?.token) {
        const signRes = await autoSignAsEmployee({
          documentId: result.documentId,
          employeeToken: employeeRecipient.token,
          employeeFullName: editorName,
          employeeRecipientId: employeeRecipient.id,
        });
        if (!signRes.ok) {
          annexLogger.warn("annex autoSign failed", {
            serviceId: id,
            docId: result.documentId,
            err: signRes.error,
          });
        }
      }
      const signingUrl = result.signingUrls[1]?.url ?? null;

      const annex = await createServiceAnnex({
        serviceId: id,
        ticketNumber: service.ticketNumber,
        deltaAmount: body.deltaAmount,
        reason: body.reason,
        acceptanceMethod: "documenso",
        documensoDocId: result.documentId,
        documensoSigningUrl: signingUrl,
        customerName,
        messageId: body.messageId ?? null,
        conversationId: body.conversationId ?? null,
        note: body.note ?? null,
        pdfHash,
        createdByEmail: user.email,
        createdByName: editorName,
      });

      void logServiceAction({
        serviceId: id,
        ticketNumber: service.ticketNumber,
        action: "annex_created",
        actor: { email: user.email, name: editorName },
        summary: `Utworzono aneks (Documenso): Δ ${body.deltaAmount} PLN`,
        payload: {
          annexId: annex?.id ?? null,
          deltaAmount: body.deltaAmount,
          reason: body.reason,
          documensoDocId: result.documentId,
          pdfHash: pdfHash.slice(0, 16),
        },
      });

      // Wave 20 / Faza 1A — notify klienta o utworzonym aneksie. Dla
      // Documenso path Documenso sam wysyła link do podpisu na email
      // klienta, więc dodatkowy nasz email jest opcjonalny ale wciąż
      // dostarcza PDF i fallback link. SMS przez Chatwoot jako reminder.
      if (annex) {
        void notifyAnnexCreated({
          service: {
            id,
            ticketNumber: service.ticketNumber,
            contactEmail: service.contactEmail,
            contactPhone: service.contactPhone,
            customerFirstName: service.customerFirstName,
            customerLastName: service.customerLastName,
            chatwootConversationId: service.chatwootConversationId,
          },
          annex,
          pdfBuffer,
          channels: ["email", "sms"],
        }).catch((err) => {
          annexLogger.warn("notify-annex post-create failed", {
            serviceId: id,
            annexId: annex.id,
            err: err instanceof Error ? err.message : String(err),
          });
        });
      }

      return NextResponse.json(
        { ok: true, annex },
        { status: 201, headers: PANEL_CORS_HEADERS },
      );
    } catch (err) {
      annexLogger.error("annex documenso failed", {
        serviceId: id,
        err: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        {
          error: "Nie udało się utworzyć aneksu Documenso",
          detail: String(err),
        },
        { status: 500, headers: PANEL_CORS_HEADERS },
      );
    }
  }

  // Phone / email — manual confirmation.
  try {
    const annex = await createServiceAnnex({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      deltaAmount: body.deltaAmount,
      reason: body.reason,
      acceptanceMethod: body.acceptanceMethod,
      customerName,
      messageId: body.messageId ?? null,
      conversationId: body.conversationId ?? null,
      note: body.note ?? null,
      createdByEmail: user.email,
      createdByName: editorName,
    });
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "annex_created",
      actor: { email: user.email, name: editorName },
      summary: `Utworzono aneks (${body.acceptanceMethod}): Δ ${body.deltaAmount} PLN`,
      payload: {
        annexId: annex?.id ?? null,
        deltaAmount: body.deltaAmount,
        acceptanceMethod: body.acceptanceMethod,
      },
    });

    // Wave 20 / Faza 1A — notify klienta przez email + SMS. PDF
    // generujemy on-the-fly (manualne ścieżki nie mają persistowanego
    // pdfHash, więc każde wysłanie maila to świeży render).
    if (annex) {
      try {
        const originalAmount =
          typeof service.amountEstimate === "number"
            ? service.amountEstimate
            : 0;
        const newAmount = Number(
          (originalAmount + body.deltaAmount).toFixed(2),
        );
        const issuedAt = annex.createdAt;
        const annexInputForPdf: AnnexInput = {
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
            deltaAmount: body.deltaAmount,
            newAmount,
          },
          customerSignerName: customerName,
          summary: body.reason,
          signedAt: issuedAt,
          issuedAt,
        };
        const pdfBuffer = await renderAnnexPdf(annexInputForPdf);
        void notifyAnnexCreated({
          service: {
            id,
            ticketNumber: service.ticketNumber,
            contactEmail: service.contactEmail,
            contactPhone: service.contactPhone,
            customerFirstName: service.customerFirstName,
            customerLastName: service.customerLastName,
            chatwootConversationId: service.chatwootConversationId,
          },
          annex,
          pdfBuffer,
          channels: ["email", "sms"],
        }).catch((err) => {
          annexLogger.warn("notify-annex manual post-create failed", {
            serviceId: id,
            annexId: annex.id,
            err: err instanceof Error ? err.message : String(err),
          });
        });
      } catch (renderErr) {
        annexLogger.warn("notify-annex render PDF failed", {
          serviceId: id,
          annexId: annex.id,
          err: renderErr instanceof Error ? renderErr.message : String(renderErr),
        });
      }
    }

    return NextResponse.json(
      { ok: true, annex },
      { status: 201, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    annexLogger.error("annex manual create failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się utworzyć aneksu", detail: String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
