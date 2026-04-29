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
 * Auth: HMAC-SHA256 signature (header X-Documenso-Signature) z secretem
 * w DOCUMENSO_WEBHOOK_SECRET.
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

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.DOCUMENSO_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/, "").trim();
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-documenso-signature");
  if (!verifySignature(rawBody, signature)) {
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

  // 2) Dokument podpisany przez wszystkich — notify uploader-a (nadawcę)
  // + zapisz status "signed" w mp_services (visual_condition.documenso.status).
  if (event === "document.signed" || event === "DOCUMENT_COMPLETED") {
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
        try {
          await updateService(service.id, {
            visualCondition: {
              ...(service.visualCondition ?? {}),
              documenso: {
                ...(service.visualCondition?.documenso ?? { docId: Number(doc.id), sentAt: new Date().toISOString() }),
                docId: Number(doc.id),
                status: "signed",
                completedAt: new Date().toISOString(),
              },
            } as typeof service.visualCondition,
          });
          logger.info("documenso status persisted as signed", {
            serviceId: service.id,
            docId: doc.id,
          });
          void logServiceAction({
            serviceId: service.id,
            ticketNumber: service.ticketNumber,
            action: "client_signed",
            actor: { name: "Klient" },
            summary: "Klient podpisał dokument elektronicznie",
            payload: { documentId: Number(doc.id) },
          });
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
