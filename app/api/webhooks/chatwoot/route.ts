export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

const logger = log.child({ module: "chatwoot-webhook" });

/**
 * Chatwoot webhook — events conversation/message + assignee changes.
 *
 * Auth: Chatwoot v3 Account Webhooks NIE PODPISUJĄ HMAC (tylko Inbox API
 * Webhooks to robią). Akceptujemy więc URL-bound secret jako query param
 * `?token=<secret>` (timing-safe compare) — wpisany w Chatwoot webhook URL.
 * Fallback: HMAC z X-Chatwoot-Signature dla inbox-level webhooków.
 * Fail-closed bez ustawionego CHATWOOT_WEBHOOK_SECRET.
 */

interface ChatwootPayload {
  event?: string;
  conversation?: {
    id?: number;
    status?: string;
    assignee?: { email?: string; name?: string };
    inbox?: { name?: string };
    contact?: { name?: string; email?: string };
  };
  message_type?: string;
  content?: string;
  sender?: { name?: string; email?: string };
}

type VerifyResult = "ok" | "no-secret" | "no-signature" | "bad-signature";

function verifyAuth(
  rawBody: string,
  signature: string | null,
  urlToken: string | null,
): VerifyResult {
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET?.trim();
  if (!secret) return "no-secret";

  // 1) URL-bound token (Chatwoot Account Webhooks bez HMAC).
  if (urlToken) {
    const provided = urlToken.trim();
    if (provided.length === secret.length) {
      try {
        if (timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
          return "ok";
        }
      } catch {
        /* fall through */
      }
    }
  }

  // 2) HMAC X-Chatwoot-Signature (Inbox API Webhooks).
  if (signature) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const provided = signature.replace(/^sha256=/, "").trim();
    if (provided.length === expected.length) {
      try {
        if (
          timingSafeEqual(
            Buffer.from(expected, "hex"),
            Buffer.from(provided, "hex"),
          )
        ) {
          return "ok";
        }
      } catch {
        /* fall through */
      }
    }
    return "bad-signature";
  }

  return "no-signature";
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
  const signature =
    req.headers.get("x-chatwoot-signature") ??
    req.headers.get("x-hub-signature-256");
  const url = new URL(req.url);
  const urlToken = url.searchParams.get("token");
  const verdict = verifyAuth(rawBody, signature, urlToken);
  if (verdict === "no-secret") {
    logger.error("CHATWOOT_WEBHOOK_SECRET nie ustawiony — odrzucam (fail-closed)");
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 503 },
    );
  }
  if (verdict !== "ok") {
    logger.warn("chatwoot webhook auth failed", { verdict, hasSig: !!signature, hasToken: !!urlToken });
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: ChatwootPayload;
  try {
    payload = JSON.parse(rawBody) as ChatwootPayload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const event = payload.event ?? "";
  // Chatwoot v3+ wysyła zmiany przypisania jako conversation_updated
  // (assignee_changed nie jest emitowany jako oddzielny event).
  const HANDLED_EVENTS = [
    "assignee_changed",
    "conversation_created",
    "conversation_updated",
    "message_created",
    "conversation_status_changed",
  ];
  if (!HANDLED_EVENTS.includes(event)) {
    return NextResponse.json({ ok: true, ignored: event });
  }

  const contact = payload.conversation?.contact;
  const contactName = contact?.name ?? contact?.email ?? "klientem";
  const conversationId = payload.conversation?.id;

  // --- message_created: nowa wiadomość od klienta ---
  if (event === "message_created") {
    // Pomijamy wiadomości wychodzące (własne odpowiedzi agentów)
    if (payload.message_type === "outgoing") {
      return NextResponse.json({ ok: true, ignored: "outgoing-message" });
    }
    const assignee = payload.conversation?.assignee;
    if (!assignee?.email) {
      return NextResponse.json({ ok: true, ignored: "no-assignee" });
    }
    const uid = await getUserIdByEmail(assignee.email);
    if (!uid) {
      return NextResponse.json({ ok: true, ignored: "no-kc-user" });
    }
    const rawContent = payload.content ?? "";
    const messagePreview =
      rawContent.length > 100 ? rawContent.slice(0, 97) + "..." : rawContent;
    const senderName = payload.sender?.name ?? contactName;
    await notifyUser(uid, "chatwoot.message.new", {
      title: "Nowa wiadomość w Chatwoot",
      body: `${senderName}: ${messagePreview}`,
      severity: "info",
      payload: {
        conversationId,
        inbox: payload.conversation?.inbox?.name,
      },
    });
    logger.info("chatwoot message_created notified", { uid, conv: conversationId });
    return NextResponse.json({ ok: true });
  }

  // --- conversation_status_changed: rozmowa rozwiązana ---
  if (event === "conversation_status_changed") {
    if (payload.conversation?.status !== "resolved") {
      return NextResponse.json({ ok: true, ignored: "status-not-resolved" });
    }
    const assignee = payload.conversation?.assignee;
    if (!assignee?.email) {
      return NextResponse.json({ ok: true, ignored: "no-assignee" });
    }
    const uid = await getUserIdByEmail(assignee.email);
    if (!uid) {
      return NextResponse.json({ ok: true, ignored: "no-kc-user" });
    }
    await notifyUser(uid, "chatwoot.conversation.resolved", {
      title: `Rozmowa #${conversationId} zakończona`,
      body: `Rozmowa z ${contactName} została oznaczona jako rozwiązana.`,
      severity: "success",
      payload: {
        conversationId,
        inbox: payload.conversation?.inbox?.name,
      },
    });
    logger.info("chatwoot conversation_resolved notified", { uid, conv: conversationId });
    return NextResponse.json({ ok: true });
  }

  // --- assignee_changed / conversation_created ---
  const assignee = payload.conversation?.assignee;
  if (!assignee?.email) {
    return NextResponse.json({ ok: true, ignored: "no-assignee" });
  }

  const uid = await getUserIdByEmail(assignee.email);
  if (!uid) {
    return NextResponse.json({ ok: true, ignored: "no-kc-user" });
  }

  await notifyUser(uid, "chatwoot.conversation.assigned", {
    title: "Przypisano Cię do rozmowy w Chatwoot",
    body: `Rozmowa #${conversationId} z ${contactName} została przypisana do Ciebie. Otwórz Chatwoot żeby odpowiedzieć.`,
    severity: "info",
    payload: {
      conversationId,
      inbox: payload.conversation?.inbox?.name,
    },
  });

  logger.info("chatwoot assignment notified", { uid, conv: conversationId });
  return NextResponse.json({ ok: true });
}
