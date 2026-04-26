export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";

const logger = log.child({ module: "chatwoot-webhook" });

/**
 * Chatwoot webhook — strzela m.in. event `assignee_changed` przy
 * przypisaniu rozmowy do agenta. Mapujemy na chatwoot.conversation.assigned.
 *
 * Auth: opcjonalna HMAC sygnatura (Chatwoot wspiera webhook secrets).
 * Jeśli secret nie skonfigurowany, akceptujemy ale logujemy warning.
 */

interface ChatwootPayload {
  event?: string;
  conversation?: {
    id?: number;
    assignee?: { email?: string; name?: string };
    inbox?: { name?: string };
    contact?: { name?: string; email?: string };
  };
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET?.trim();
  if (!secret) return true; // not configured — accept (best-effort)
  if (!signature) return false;
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
  const signature = req.headers.get("x-chatwoot-signature") ?? req.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: ChatwootPayload;
  try {
    payload = JSON.parse(rawBody) as ChatwootPayload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const event = payload.event ?? "";
  if (event !== "assignee_changed" && event !== "conversation_created") {
    return NextResponse.json({ ok: true, ignored: event });
  }

  const assignee = payload.conversation?.assignee;
  if (!assignee?.email) {
    return NextResponse.json({ ok: true, ignored: "no-assignee" });
  }

  const uid = await getUserIdByEmail(assignee.email);
  if (!uid) {
    return NextResponse.json({ ok: true, ignored: "no-kc-user" });
  }

  const contact = payload.conversation?.contact;
  await notifyUser(uid, "chatwoot.conversation.assigned", {
    title: "Przypisano Cię do rozmowy w Chatwoot",
    body: `Rozmowa #${payload.conversation?.id} z ${contact?.name ?? contact?.email ?? "klientem"} została przypisana do Ciebie. Otwórz Chatwoot żeby odpowiedzieć.`,
    severity: "info",
    payload: {
      conversationId: payload.conversation?.id,
      inbox: payload.conversation?.inbox?.name,
    },
  });

  logger.info("chatwoot assignment notified", { uid, conv: payload.conversation?.id });
  return NextResponse.json({ ok: true });
}
