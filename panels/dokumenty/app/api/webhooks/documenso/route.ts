import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { broadcast } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.DOCUMENSO_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature.replace(/^sha256=/, ""));
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const EVENT_MAP: Record<string, import("@/lib/events").EventPayload["type"]> = {
  "DOCUMENT_CREATED": "submission.created",
  "DOCUMENT_SENT": "submission.created",
  "DOCUMENT_OPENED": "submitter.opened",
  "DOCUMENT_VIEWED": "submitter.opened",
  "DOCUMENT_SIGNED": "submitter.signed",
  "DOCUMENT_COMPLETED": "submission.completed",
  "DOCUMENT_REJECTED": "submission.declined",
  "DOCUMENT_CANCELLED": "submission.expired",
};

export async function POST(req: Request) {
  const raw = await req.text();
  const sig =
    req.headers.get("X-Documenso-Signature") ??
    req.headers.get("x-documenso-secret") ??
    req.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event: string = (body?.event ?? body?.eventType ?? "").toString().toUpperCase();
  const type = EVENT_MAP[event];
  if (!type) {
    return NextResponse.json({ ok: true, ignored: true, event });
  }

  const payload = body?.payload ?? body?.data ?? body;
  broadcast({
    type,
    submissionId: payload?.documentId ?? payload?.id,
    submitterId: payload?.recipient?.id ?? payload?.recipientId,
    at: new Date().toISOString(),
    data: {
      event,
      email: payload?.recipient?.email ?? payload?.email,
      status: payload?.status,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: !!process.env.DOCUMENSO_WEBHOOK_SECRET,
    url: "/api/webhooks/documenso",
  });
}
