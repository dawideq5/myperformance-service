export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { findServiceByDocumensoId, updateService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";

const logger = log.child({ module: "documenso-webhook" });

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

interface DocumensoPayload {
  event?: string;
  payload?: {
    id?: string;
    title?: string;
    documentId?: string;
    document?: {
      id?: string | number;
      title?: string;
      User?: { email?: string };
      Recipient?: Array<{ email?: string; name?: string; signedAt?: string | null }>;
    };
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
  const rawBody = await req.text();
  const rawSecret = req.headers.get("x-documenso-secret");
  const hmacSignature = req.headers.get("x-documenso-signature");
  if (!verifyAuth(rawBody, rawSecret, hmacSignature)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: DocumensoPayload;
  try {
    payload = JSON.parse(rawBody) as DocumensoPayload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const event = payload.event ?? "";
  const doc = payload.payload?.document ?? payload.payload;
  const docTitle = doc && "title" in doc ? doc.title : payload.payload?.title;
  const recipients = (payload.payload?.document?.Recipient ?? []).filter(
    (r): r is { email: string; name?: string; signedAt?: string | null } => !!r?.email,
  );

  // 1) Prośba o podpis — wysłana do każdego recipienta
  if (event === "document.sent" || event === "DOCUMENT_SENT") {
    for (const r of recipients) {
      const uid = await getUserIdByEmail(r.email);
      if (!uid) continue;
      await notifyUser(uid, "documents.signature.requested", {
        title: "Prośba o podpis dokumentu",
        body: `${docTitle ?? "Dokument"} czeka na Twój podpis.`,
        severity: "info",
        payload: { documentId: doc?.id, title: docTitle },
        forceEmail: true,
      });
    }
    return NextResponse.json({ ok: true, action: "requested", count: recipients.length });
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
    const ownerEmail = payload.payload?.document?.User?.email;
    if (ownerEmail) {
      const uid = await getUserIdByEmail(ownerEmail);
      if (uid) {
        await notifyUser(uid, "documents.signature.completed", {
          title: "Dokument podpisany",
          body: `${docTitle ?? "Dokument"} został w pełni podpisany przez wszystkie strony.`,
          severity: "success",
          payload: { documentId: doc?.id, title: docTitle },
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
              summary:
                "Klient podpisał dokument elektronicznie — potwierdzenie zatwierdzone",
              payload: {
                documentId: Number(doc.id),
              },
            });
          }
        } catch (e) {
          logger.warn("failed to persist signed status", {
            serviceId: service.id,
            err: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        logger.warn("documenso webhook: service not found for docId", {
          docId: doc.id,
        });
      }
    }
    logger.info("documenso doc completed", { docId: doc?.id });
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
      }
    }
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  return NextResponse.json({ ok: true, ignored: event });
}
