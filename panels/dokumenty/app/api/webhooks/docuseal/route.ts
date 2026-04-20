import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { broadcast } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;
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
  "submission.created": "submission.created",
  "submission.completed": "submission.completed",
  "submission.declined": "submission.declined",
  "submission.expired": "submission.expired",
  "form.viewed": "submitter.opened",
  "form.started": "submitter.opened",
  "form.completed": "submitter.signed",
  "form.declined": "submission.declined",
};

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("X-Docuseal-Signature") ?? req.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event: string = body?.event_type ?? body?.event ?? "";
  const type = EVENT_MAP[event];
  if (!type) {
    return NextResponse.json({ ok: true, ignored: true, event });
  }

  const data = body?.data ?? body;
  broadcast({
    type,
    submissionId: data?.submission_id ?? data?.submission?.id ?? data?.id,
    submitterId: data?.submitter?.id ?? data?.id,
    at: new Date().toISOString(),
    data: { event, email: data?.email, status: data?.status },
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: !!process.env.DOCUSEAL_WEBHOOK_SECRET,
    url: "/api/webhooks/docuseal",
  });
}
