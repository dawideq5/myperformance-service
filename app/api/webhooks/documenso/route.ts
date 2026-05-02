export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { findServiceByDocumensoId, updateService, getService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import { downloadDocumentPdf } from "@/lib/documenso";
import {
  findAnnexByDocumensoId,
  updateServiceAnnex,
} from "@/lib/service-annexes";
import { createQuoteHistoryEntry } from "@/lib/service-quote-history";
import { sendMail } from "@/lib/smtp";
import { renderSignedReceiptEmail } from "@/lib/email/signed-receipt";
import { getLocation } from "@/lib/locations";
import { getOptionalEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { recordWebhookHit } from "@/lib/webhooks/health";

const logger = log.child({ module: "documenso-webhook" });

/** Po DOCUMENT_COMPLETED elektronicznym wyślij klientowi kopię
 * podpisanego dokumentu jako załącznik PDF. Email wysyłany z systemowego
 * adresu CONFIRMATION_EMAIL_FROM (default caseownia@zlecenieserwisowe.pl)
 * z brandowanym layoutem (logo + telefon punktu serwisowego). */
async function sendSignedReceiptToCustomer(
  serviceId: string,
  ticketNumber: string | null,
  customerEmail: string | null,
  customerFirstName: string | null,
  documentId: number,
  serviceLocationId: string | null,
): Promise<void> {
  if (!customerEmail) {
    logger.info("send signed receipt skipped — brak emaila klienta", {
      serviceId,
    });
    return;
  }
  // Documenso emituje DOCUMENT_SIGNED zaraz po podpisie ostatniego
  // signera; seal-document trwa kilka sekund. Retry z backoff 2s/5s/10s
  // żeby pobrać sealed PDF a nie 400 "Document not completed".
  let buffer: Buffer | null = null;
  const delays = [0, 2000, 5000, 10_000];
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const dl = await downloadDocumentPdf(documentId);
    if (dl.ok) {
      buffer = Buffer.from(await dl.arrayBuffer());
      break;
    }
    logger.info("download signed PDF retry", {
      serviceId,
      documentId,
      status: dl.status,
      delayMs: delay,
    });
  }
  if (!buffer) {
    logger.warn("download signed PDF failed after retries", {
      serviceId,
      documentId,
    });
    return;
  }
  const serviceLocation = serviceLocationId
    ? await getLocation(serviceLocationId).catch(() => null)
    : null;
  const { subject, html, text } = renderSignedReceiptEmail({
    customerFirstName,
    ticketNumber,
    serviceLocationPhone: serviceLocation?.phone ?? null,
  });
  const fromAddress =
    getOptionalEnv("CONFIRMATION_EMAIL_FROM", "").trim() ||
    "caseownia@zlecenieserwisowe.pl";
  const fromName =
    getOptionalEnv("CONFIRMATION_EMAIL_FROM_NAME", "").trim() ||
    "Serwis Telefonów by Caseownia";
  await sendMail({
    to: customerEmail,
    subject,
    html,
    text,
    fromName,
    fromAddress,
    replyTo: fromAddress,
    transport: "confirmation",
    attachments: [
      {
        filename: `Potwierdzenie-${ticketNumber ?? documentId}.pdf`,
        content: buffer,
        contentType: "application/pdf",
      },
    ],
  });
  logger.info("signed receipt sent to customer", {
    serviceId,
    customerEmail,
    documentId,
  });
}

/**
 * Documenso webhook receiver. Documenso wysyła:
 *   - document.signed — gdy ostatni signer podpisał (status COMPLETED)
 *   - document.sent — gdy ktoś wysłał dokument (status PENDING)
 *   - document.viewed — gdy signer otworzył link
 *
 * My mapujemy:
 *   document.sent + targetEmail = signer    → documents.signature.requested
 *   document.signed + uploaderEmail         → documents.signature.completed
 *
 * Auth: Documenso v3 wysyła RAW secret w headerze `X-Documenso-Secret`,
 * porównywany timing-safe z `DOCUMENSO_WEBHOOK_SECRET`. (Stare wersje
 * używały HMAC `X-Documenso-Signature` — pozostawiamy fallback).
 */

interface DocumensoRecipient {
  email?: string;
  name?: string;
  signedAt?: string | null;
}

interface DocumensoPayload {
  event?: string;
  payload?: {
    id?: string | number;
    title?: string;
    documentId?: string;
    User?: { email?: string };
    user?: { email?: string };
    Recipient?: DocumensoRecipient[];
    recipients?: DocumensoRecipient[];
    document?: {
      id?: string | number;
      title?: string;
      User?: { email?: string };
      user?: { email?: string };
      Recipient?: DocumensoRecipient[];
      recipients?: DocumensoRecipient[];
    };
  };
}

/**
 * Documenso v3 wysyła recipients pod różnymi ścieżkami zależnie od event
 * type i wersji: top-level (payload.payload.Recipient) lub nested
 * (payload.payload.document.Recipient). Plus istnieje lowercase alias
 * `recipients`. Spróbuj wszystkich.
 */
function extractRecipients(payload: DocumensoPayload): DocumensoRecipient[] {
  const candidates = [
    payload.payload?.Recipient,
    payload.payload?.recipients,
    payload.payload?.document?.Recipient,
    payload.payload?.document?.recipients,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return [];
}

function extractDocumentInfo(payload: DocumensoPayload): {
  id: string | number | undefined;
  title: string | undefined;
  ownerEmail: string | undefined;
} {
  const inner = payload.payload?.document;
  return {
    id: inner?.id ?? payload.payload?.id,
    title: inner?.title ?? payload.payload?.title,
    ownerEmail:
      inner?.User?.email ??
      inner?.user?.email ??
      payload.payload?.User?.email ??
      payload.payload?.user?.email,
  };
}

function verifyAuth(
  rawBody: string,
  rawSecret: string | null,
  hmacSignature: string | null,
): boolean {
  const secret = process.env.DOCUMENSO_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  // Documenso v3: raw secret in X-Documenso-Secret header — timing-safe.
  if (rawSecret) {
    const provided = rawSecret.trim();
    if (provided.length !== secret.length) return false;
    try {
      return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
    } catch {
      return false;
    }
  }
  // Legacy HMAC fallback for older Documenso versions.
  if (hmacSignature) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const provided = hmacSignature.replace(/^sha256=/, "").trim();
    if (provided.length !== expected.length) return false;
    try {
      return timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(provided, "hex"),
      );
    } catch {
      return false;
    }
  }
  return false;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`webhook:documenso:${ip}`, {
    capacity: 60,
    refillPerSec: 1,
  });
  if (!rl.allowed) {
    logger.warn("webhook rate-limited", { ip });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const rawBody = await req.text();
  const rawSecret = req.headers.get("x-documenso-secret");
  const hmacSignature = req.headers.get("x-documenso-signature");
  if (!verifyAuth(rawBody, rawSecret, hmacSignature)) {
    await recordWebhookHit("documenso", "auth_failed");
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: DocumensoPayload;
  try {
    payload = JSON.parse(rawBody) as DocumensoPayload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const event = payload.event ?? "";
  const docInfo = extractDocumentInfo(payload);
  const doc = payload.payload?.document ?? payload.payload;
  const docTitle = docInfo.title;
  const recipients = extractRecipients(payload).filter(
    (r): r is { email: string; name?: string; signedAt?: string | null } =>
      typeof r?.email === "string" && r.email.length > 0,
  );

  // 0) Przypomnienie o podpisie — Documenso v3 emituje DOCUMENT_REMINDER_SENT
  // gdy auto-reminder cron wysyła pinga do recipientów którzy jeszcze nie
  // podpisali. Wysyłamy nasz osobny event documents.signature.reminder.
  if (event === "DOCUMENT_REMINDER_SENT" || event === "document.reminder.sent") {
    let notified = 0;
    for (const r of recipients) {
      if (r.signedAt) continue;
      const uid = await getUserIdByEmail(r.email);
      if (!uid) continue;
      await notifyUser(uid, "documents.signature.reminder", {
        title: "Przypomnienie: dokument do podpisu",
        body: `${docTitle ?? "Dokument"} wciąż czeka na Twój podpis.`,
        severity: "warning",
        payload: { documentId: docInfo.id, title: docTitle },
        forceEmail: true,
      });
      notified++;
    }
    logger.info("documenso DOCUMENT_REMINDER_SENT processed", {
      docId: docInfo.id,
      notified,
    });
    await recordWebhookHit("documenso", "ok", event, `reminder:${notified}`);
    return NextResponse.json({ ok: true, action: "reminder", notified });
  }

  // 1) Prośba o podpis — wysłana do każdego recipienta
  if (event === "document.sent" || event === "DOCUMENT_SENT") {
    let notified = 0;
    for (const r of recipients) {
      const uid = await getUserIdByEmail(r.email);
      if (!uid) {
        logger.info("documenso recipient skipped — no kc user", { email: r.email });
        continue;
      }
      await notifyUser(uid, "documents.signature.requested", {
        title: "Prośba o podpis dokumentu",
        body: `${docTitle ?? "Dokument"} czeka na Twój podpis.`,
        severity: "info",
        payload: { documentId: docInfo.id, title: docTitle },
        forceEmail: true,
      });
      notified++;
    }
    logger.info("documenso DOCUMENT_SENT processed", {
      docId: docInfo.id,
      total: recipients.length,
      notified,
    });
    await recordWebhookHit("documenso", "ok", event, `requested:${notified}/${recipients.length}`);
    return NextResponse.json({
      ok: true,
      action: "requested",
      total: recipients.length,
      notified,
    });
  }

  // 1b) Pojedynczy recipient podpisał (intermediate w sequential signing).
  // Documenso v3 emituje DOCUMENT_SIGNED dla pierwszego signera i
  // DOCUMENT_COMPLETED gdy wszyscy. Sprawdzamy ile recipientów ma
  // signedAt — jeśli pierwszy z dwóch, to "employee_signed".
  if (event === "document.signed" || event === "DOCUMENT_SIGNED") {
    if (doc?.id != null) {
      const service = await findServiceByDocumensoId(doc.id);
      if (service) {
        const recs = recipients ?? [];
        const signedCount = recs.filter((r) => r.signedAt).length;
        const totalCount = recs.length;
        // Pierwszy z 2: pracownik podpisał, status="employee_signed".
        // (Documenso v3: DOCUMENT_SIGNED = pojedynczy podpis,
        // DOCUMENT_COMPLETED = wszystkie. Tu obsługujemy intermediate.)
        if (signedCount > 0 && signedCount < totalCount) {
          try {
            const cur = service.visualCondition?.documenso;
            await updateService(service.id, {
              visualCondition: {
                ...(service.visualCondition ?? {}),
                documenso: {
                  ...(cur ?? { docId: Number(doc.id), sentAt: new Date().toISOString() }),
                  docId: Number(doc.id),
                  status: "employee_signed",
                  employeeSignedAt: new Date().toISOString(),
                },
              } as typeof service.visualCondition,
            });
            void logServiceAction({
              serviceId: service.id,
              ticketNumber: service.ticketNumber,
              action: "employee_sign",
              actor: { name: "Pracownik" },
              summary:
                "Pracownik podpisał — oczekiwanie na podpis klienta",
              payload: { documentId: Number(doc.id) },
            });
          } catch (e) {
            logger.warn("intermediate sign persist failed", {
              serviceId: service.id,
              err: String(e),
            });
          }
          return NextResponse.json({ ok: true, action: "employee_signed" });
        }
        // signedCount === totalCount → fall through do COMPLETED block
      }
    }
  }

  // 2) Dokument podpisany przez wszystkich — notify uploader-a (nadawcę)
  // + zapisz status "signed" w mp_services (visual_condition.documenso.status)
  // + pobierz podpisany PDF i zapisz w signed-receipts MinIO.
  if (event === "document.completed" || event === "DOCUMENT_COMPLETED" || event === "document.signed" || event === "DOCUMENT_SIGNED") {
    const ownerEmail = docInfo.ownerEmail;
    if (ownerEmail) {
      const uid = await getUserIdByEmail(ownerEmail);
      if (uid) {
        await notifyUser(uid, "documents.signature.completed", {
          title: "Dokument podpisany",
          body: `${docTitle ?? "Dokument"} został w pełni podpisany przez wszystkie strony.`,
          severity: "success",
          payload: { documentId: docInfo.id, title: docTitle },
        });
      }
    }
    if (doc?.id != null) {
      const service = await findServiceByDocumensoId(doc.id);
      if (service) {
        // Paper-flow detection: jeśli aktualny status to paper_pending lub
        // paper_signed, NIE zmieniamy statusu na "signed" (paper flow ma
        // własny stan). Tylko ustawiamy signedPdfUrl marker żeby UI mógł
        // otworzyć PDF z podpisem pracownika.
        const cur = service.visualCondition?.documenso;
        const isPaperFlow =
          cur?.status === "paper_pending" || cur?.status === "paper_signed";
        const signedPdfUrl = "available";
        try {
          await updateService(service.id, {
            visualCondition: {
              ...(service.visualCondition ?? {}),
              documenso: {
                ...(cur ?? {
                  docId: Number(doc.id),
                  sentAt: new Date().toISOString(),
                }),
                docId: Number(doc.id),
                ...(isPaperFlow
                  ? {} // zachowaj paper_pending/paper_signed status
                  : { status: "signed", completedAt: new Date().toISOString() }),
                signedPdfUrl,
              },
            } as typeof service.visualCondition,
          });
          logger.info("documenso status persisted", {
            serviceId: service.id,
            docId: doc.id,
            isPaperFlow,
          });
          if (!isPaperFlow) {
            void logServiceAction({
              serviceId: service.id,
              ticketNumber: service.ticketNumber,
              action: "client_signed",
              actor: { name: "Klient" },
              summary: "",
              payload: {
                documentId: Number(doc.id),
              },
            });
            // Wyślij klientowi kopię podpisanego dokumentu mailem.
            void sendSignedReceiptToCustomer(
              service.id,
              service.ticketNumber,
              service.contactEmail,
              service.customerFirstName,
              Number(doc.id),
              service.serviceLocationId ?? service.locationId,
            ).catch((e) => {
              logger.warn("send signed receipt failed", {
                serviceId: service.id,
                err: e instanceof Error ? e.message : String(e),
              });
            });
          }
        } catch (e) {
          logger.warn("failed to persist signed status", {
            serviceId: service.id,
            err: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        // Brak match'u w mp_services — sprawdź mp_service_annexes (Documenso
        // doc utworzony przez POST /annex). Idempotent UPDATE: jeśli już
        // accepted, no-op.
        const annex = await findAnnexByDocumensoId(Number(doc.id));
        if (annex) {
          if (annex.acceptanceStatus === "accepted") {
            logger.info("annex already accepted — no-op", {
              annexId: annex.id,
              docId: doc.id,
            });
          } else {
            try {
              const acceptedAt = new Date().toISOString();
              await updateServiceAnnex(annex.id, {
                acceptanceStatus: "accepted",
                acceptedAt,
              });
              const svc = await getService(annex.serviceId);
              if (svc) {
                const oldAmount =
                  typeof svc.amountEstimate === "number"
                    ? svc.amountEstimate
                    : 0;
                const newAmount = Number(
                  (oldAmount + annex.deltaAmount).toFixed(2),
                );
                await updateService(svc.id, { amountEstimate: newAmount });
                await createQuoteHistoryEntry({
                  serviceId: svc.id,
                  ticketNumber: svc.ticketNumber,
                  oldAmount,
                  newAmount,
                  reason: `Aneks zaakceptowany przez Documenso: ${annex.reason}`,
                  annexId: annex.id,
                  changedByEmail: null,
                  changedByName: "Klient (Documenso)",
                });
              }
              // Wave 21 / Faza 1E — human-readable summary.
              const wbVerb =
                annex.deltaAmount > 0
                  ? "zwiększona"
                  : annex.deltaAmount < 0
                    ? "obniżona"
                    : "bez zmian";
              void logServiceAction({
                serviceId: annex.serviceId,
                ticketNumber: annex.ticketNumber,
                action: "annex_accepted",
                actor: { name: "Klient (Documenso)" },
                summary: `Klient zaakceptował aneks — wycena ${wbVerb} o ${Math.abs(annex.deltaAmount).toFixed(2)} PLN`,
                payload: {
                  annexId: annex.id,
                  documensoDocId: Number(doc.id),
                  deltaAmount: annex.deltaAmount,
                },
              });
              logger.info("annex accepted via Documenso", {
                annexId: annex.id,
                docId: doc.id,
              });
            } catch (e) {
              logger.warn("annex accept persist failed", {
                annexId: annex.id,
                err: e instanceof Error ? e.message : String(e),
              });
            }
          }
        } else {
          logger.warn("documenso webhook: no service or annex match", {
            docId: doc.id,
          });
        }
      }
    }
    logger.info("documenso doc completed", { docId: doc?.id });
    await recordWebhookHit("documenso", "ok", event, "completed");
    return NextResponse.json({ ok: true, action: "completed" });
  }

  // 3) Dokument odrzucony przez recipienta
  if (event === "document.rejected" || event === "DOCUMENT_REJECTED") {
    if (doc?.id != null) {
      const service = await findServiceByDocumensoId(doc.id);
      if (service) {
        try {
          await updateService(service.id, {
            visualCondition: {
              ...(service.visualCondition ?? {}),
              documenso: {
                ...(service.visualCondition?.documenso ?? { docId: Number(doc.id), sentAt: new Date().toISOString() }),
                docId: Number(doc.id),
                status: "rejected",
                completedAt: new Date().toISOString(),
              },
            } as typeof service.visualCondition,
          });
          void logServiceAction({
            serviceId: service.id,
            ticketNumber: service.ticketNumber,
            action: "client_rejected",
            actor: { name: "Klient" },
            summary: "Klient odrzucił dokument elektroniczny",
            payload: { documentId: Number(doc.id) },
          });
        } catch {
          /* ignore — notify still goes through */
        }
      } else {
        // Może to być rejection aneksu — sprawdź mp_service_annexes.
        const annex = await findAnnexByDocumensoId(Number(doc.id));
        if (annex && annex.acceptanceStatus === "pending") {
          try {
            await updateServiceAnnex(annex.id, {
              acceptanceStatus: "rejected",
              rejectedAt: new Date().toISOString(),
            });
            void logServiceAction({
              serviceId: annex.serviceId,
              ticketNumber: annex.ticketNumber,
              action: "annex_rejected",
              actor: { name: "Klient (Documenso)" },
              summary: `Klient odrzucił aneks (zmiana wyceny o ${Math.abs(annex.deltaAmount).toFixed(2)} PLN)`,
              payload: {
                annexId: annex.id,
                documensoDocId: Number(doc.id),
                deltaAmount: annex.deltaAmount,
              },
            });
          } catch (e) {
            logger.warn("annex reject persist failed", {
              annexId: annex.id,
              err: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
    }
    await recordWebhookHit("documenso", "ok", event, "rejected");
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  await recordWebhookHit("documenso", "ignored", event);
  return NextResponse.json({ ok: true, ignored: event });
}
