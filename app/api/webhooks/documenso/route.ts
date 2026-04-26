export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";

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
    logger.info("documenso doc completed", { docId: doc?.id });
    return NextResponse.json({ ok: true, action: "completed" });
  }

  return NextResponse.json({ ok: true, ignored: event });
}
