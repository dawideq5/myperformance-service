export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { getChatwootAgentEmail } from "@/lib/chatwoot/agent-lookup";
import { recordWebhookHit } from "@/lib/webhooks/health";

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

interface ChatwootAssignee {
  id?: number;
  email?: string;
  name?: string;
}

interface ChatwootPayload {
  event?: string;
  conversation?: {
    id?: number;
    status?: string;
    assignee?: ChatwootAssignee;
    meta?: { assignee?: ChatwootAssignee };
    inbox?: { name?: string };
    contact?: { name?: string; email?: string };
  };
  meta?: { assignee?: ChatwootAssignee };
  message_type?: string;
  content?: string;
  sender?: { name?: string; email?: string };
}

/**
 * Wyciąga assignee z możliwych lokalizacji w Chatwoot v3 payload:
 * conversation.assignee (legacy), conversation.meta.assignee (v3),
 * meta.assignee (top-level v3 webhook). Następnie resolve email — albo
 * z payloadu (rzadko), albo przez Platform API po id.
 */
async function resolveAssigneeEmail(
  payload: ChatwootPayload,
): Promise<string | null> {
  const assignee =
    payload.conversation?.assignee ??
    payload.conversation?.meta?.assignee ??
    payload.meta?.assignee ??
    null;
  if (!assignee) return null;
  if (assignee.email) return assignee.email;
  if (typeof assignee.id === "number") {
    return getChatwootAgentEmail(assignee.id);
  }
  return null;
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
    await recordWebhookHit("chatwoot", "error", undefined, "no-secret");
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 503 },
    );
  }
  if (verdict !== "ok") {
    logger.warn("chatwoot webhook auth failed", { verdict, hasSig: !!signature, hasToken: !!urlToken });
    await recordWebhookHit("chatwoot", "auth_failed", undefined, verdict);
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
    await recordWebhookHit("chatwoot", "ignored", event);
    return NextResponse.json({ ok: true, ignored: event });
  }

  const contact = payload.conversation?.contact;
  const contactName = contact?.name ?? contact?.email ?? "klientem";
  const conversationId = payload.conversation?.id;

  // --- message_created: nowa wiadomość od klienta ---
  if (event === "message_created") {
    if (payload.message_type === "outgoing") {
      return NextResponse.json({ ok: true, ignored: "outgoing-message" });
    }
    const assigneeEmail = await resolveAssigneeEmail(payload);
    if (!assigneeEmail) {
      logger.info("chatwoot message_created skipped — no assignee email", { conversationId });
      return NextResponse.json({ ok: true, ignored: "no-assignee" });
    }
    const uid = await getUserIdByEmail(assigneeEmail);
    if (!uid) {
      logger.info("chatwoot no kc user", { conversationId, email: assigneeEmail });
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
    await recordWebhookHit("chatwoot", "ok", "message_created");
    return NextResponse.json({ ok: true });
  }

  // --- conversation_status_changed: rozmowa rozwiązana ---
  if (event === "conversation_status_changed") {
    if (payload.conversation?.status !== "resolved") {
      return NextResponse.json({ ok: true, ignored: "status-not-resolved" });
    }
    const assigneeEmail = await resolveAssigneeEmail(payload);
    if (!assigneeEmail) {
      return NextResponse.json({ ok: true, ignored: "no-assignee" });
    }
    const uid = await getUserIdByEmail(assigneeEmail);
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
    await recordWebhookHit("chatwoot", "ok", "conversation_status_changed");
    return NextResponse.json({ ok: true });
  }

  // --- assignee_changed / conversation_created / conversation_updated ---
  const assigneeEmail = await resolveAssigneeEmail(payload);
  if (!assigneeEmail) {
    return NextResponse.json({ ok: true, ignored: "no-assignee" });
  }

  const uid = await getUserIdByEmail(assigneeEmail);
  if (!uid) {
    return NextResponse.json({ ok: true, ignored: "no-kc-user" });
  }

  await notifyUser(uid, "chatwoot.conversation.assigned", {
    title: "Przypisano Cię do rozmowy w Chatwoot",
    body: `Rozmowa #${conversationId} z ${contactName} została przypisana do Ciebie.`,
    severity: "info",
    payload: {
      conversationId,
      inbox: payload.conversation?.inbox?.name,
    },
  });

  logger.info("chatwoot assignment notified", { uid, conv: conversationId });
  await recordWebhookHit("chatwoot", "ok", event);
  return NextResponse.json({ ok: true });
}
