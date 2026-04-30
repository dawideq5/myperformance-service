export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

const logger = log.child({ module: "chatwoot-webhook" });

/**
 * Chatwoot webhook — strzela m.in. event `assignee_changed` przy
 * przypisaniu rozmowy do agenta. Mapujemy na chatwoot.conversation.assigned.
 *
 * Auth: HMAC sygnatura (Chatwoot wspiera webhook secrets). Tryb fail-closed:
 * gdy CHATWOOT_WEBHOOK_SECRET nie ustawiony w env, zwracamy 503 — webhook
 * NIE jest publicznym endpointem do anonimowych powiadomień.
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

type VerifyResult = "ok" | "no-secret" | "no-signature" | "bad-signature";

function verifySignature(rawBody: string, signature: string | null): VerifyResult {
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET?.trim();
  if (!secret) return "no-secret";
  if (!signature) return "no-signature";
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/, "").trim();
  if (provided.length !== expected.length) return "bad-signature";
  try {
    const ok = timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex"),
    );
    return ok ? "ok" : "bad-signature";
  } catch {
    return "bad-signature";
  }
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`webhook:chatwoot:${ip}`, {
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
  const signature = req.headers.get("x-chatwoot-signature") ?? req.headers.get("x-hub-signature-256");
  const verdict = verifySignature(rawBody, signature);
  if (verdict === "no-secret") {
    logger.error("CHATWOOT_WEBHOOK_SECRET nie ustawiony — odrzucam webhook (fail-closed)");
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 503 },
    );
  }
  if (verdict !== "ok") {
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
