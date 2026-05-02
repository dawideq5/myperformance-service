export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import {
  getChatwootAgentEmail,
  getChatwootInboxAgentEmails,
} from "@/lib/chatwoot/agent-lookup";
import { recordWebhookHit } from "@/lib/webhooks/health";
import { bindInboundToService } from "@/lib/chatwoot/service-binding";
import { claimInboundMessage } from "@/lib/chatwoot/inbound-dedup";
import { publish } from "@/lib/sse-bus";

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
  /** Top-level message id (Chatwoot v3 message_created webhook). */
  id?: number;
  conversation?: {
    id?: number;
    status?: string;
    assignee?: ChatwootAssignee;
    meta?: { assignee?: ChatwootAssignee };
    inbox?: { id?: number; name?: string };
    inbox_id?: number;
    contact?: {
      name?: string;
      email?: string;
      phone_number?: string;
      identifier?: string;
    };
    additional_attributes?: Record<string, unknown>;
    custom_attributes?: Record<string, unknown>;
  };
  inbox_id?: number;
  meta?: { assignee?: ChatwootAssignee };
  message_type?: string;
  content?: string;
  sender?: {
    name?: string;
    email?: string;
    phone_number?: string;
    identifier?: string;
  };
}

function extractInboxId(payload: ChatwootPayload): number | null {
  return (
    payload.conversation?.inbox?.id ??
    payload.conversation?.inbox_id ??
    payload.inbox_id ??
    null
  );
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
    const rawContent = payload.content ?? "";
    const messagePreview =
      rawContent.length > 100 ? rawContent.slice(0, 97) + "..." : rawContent;
    const senderName = payload.sender?.name ?? contactName;

    // --- 1) Dedup ---
    // Chatwoot bywa zachłanny z retry. Pierwszy claim wygrywa, kolejne hity
    // tej samej wiadomości zwracamy jako ignored (200 OK).
    const messageId =
      typeof payload.id === "number" && Number.isFinite(payload.id)
        ? payload.id
        : null;
    if (messageId !== null) {
      const claimed = await claimInboundMessage({
        messageId,
        conversationId: conversationId ?? null,
      });
      if (!claimed) {
        await recordWebhookHit("chatwoot", "ignored", "message_created", "dedup");
        return NextResponse.json({ ok: true, ignored: "dedup" });
      }
    }

    // --- 2) Service binding (parallel z resolveAssignee) ---
    // Próbujemy zmapować wiadomość na otwarte zlecenie:
    //   - SVC-RRRR-MM-NNNN w treści
    //   - additional_attributes.ticket_number z pre-chat formularza
    //   - email kontaktu
    //   - telefon kontaktu (SMS inbox bez emaila)
    const ticketHintRaw =
      (payload.conversation?.additional_attributes?.ticket_number as
        | string
        | undefined) ??
      (payload.conversation?.custom_attributes?.ticket_number as
        | string
        | undefined) ??
      null;
    const customerEmail =
      contact?.email ?? payload.sender?.email ?? null;
    const customerPhone =
      contact?.phone_number ?? payload.sender?.phone_number ?? null;
    const [assigneeEmail, binding] = await Promise.all([
      resolveAssigneeEmail(payload),
      bindInboundToService({
        messageBody: rawContent,
        customerEmail,
        customerPhone,
        ticketNumberHint: ticketHintRaw,
      }),
    ]);
    const boundService = binding?.service ?? null;
    const ticketSuffix = boundService
      ? ` · #${boundService.ticketNumber}`
      : "";
    const sharedNotifyPayload: Record<string, unknown> = {
      conversationId,
      inbox: payload.conversation?.inbox?.name,
      ...(boundService
        ? {
            serviceId: boundService.id,
            ticketNumber: boundService.ticketNumber,
            matchedBy: binding?.matchedBy,
          }
        : {}),
    };

    // --- 3) Service-bound fan-out ---
    // Gdy zlecenie zidentyfikowane: powiadom przypisanego serwisanta +
    // sprzedawcę przyjmującego (received_by). Niezależne od fan-outu agenta
    // Chatwoota — oba kanały biegną równolegle.
    if (boundService) {
      const serviceTargets = new Set<string>();
      if (boundService.assignedTechnician) {
        serviceTargets.add(boundService.assignedTechnician.toLowerCase());
      }
      if (boundService.receivedBy) {
        serviceTargets.add(boundService.receivedBy.toLowerCase());
      }
      const uids = await Promise.all(
        Array.from(serviceTargets).map(getUserIdByEmail),
      );
      const finalUids = Array.from(
        new Set(uids.filter((u): u is string => typeof u === "string")),
      );
      await Promise.allSettled(
        finalUids.map((uid) =>
          notifyUser(uid, "chatwoot.message.new", {
            title: `Wiadomość od klienta${ticketSuffix}`,
            body: `${senderName}: ${messagePreview}`,
            severity: "info",
            payload: sharedNotifyPayload,
          }),
        ),
      );
      // SSE push również per service — detail view subskrybuje per serviceId.
      publish({
        type: "chat_message_received",
        serviceId: boundService.id,
        userEmail: null,
        payload: {
          conversationId,
          senderName,
          preview: messagePreview,
          inbox: payload.conversation?.inbox?.name ?? null,
          ticketNumber: boundService.ticketNumber,
          matchedBy: binding?.matchedBy ?? null,
        },
      });
      logger.info("chatwoot service-bound notify", {
        conv: conversationId,
        ticket: boundService.ticketNumber,
        targets: finalUids.length,
        matchedBy: binding?.matchedBy,
      });
    }

    // Path A: rozmowa przypisana → notyfikuj agenta-przypisanego (chatwoot.message.new)
    if (assigneeEmail) {
      const uid = await getUserIdByEmail(assigneeEmail);
      if (!uid) {
        logger.info("chatwoot no kc user", { conversationId, email: assigneeEmail });
        await recordWebhookHit("chatwoot", "ignored", "message_created", "no-kc-user");
        return NextResponse.json({ ok: true, ignored: "no-kc-user", boundTicket: boundService?.ticketNumber ?? null });
      }
      await notifyUser(uid, "chatwoot.message.new", {
        title: `Nowa wiadomość w Chatwoot${ticketSuffix}`,
        body: `${senderName}: ${messagePreview}`,
        severity: "info",
        payload: sharedNotifyPayload,
      });
      // Real-time push (Wave 19/Phase 1D) — panel detail subskrybuje per
      // service.chatwootConversationId i wyświetla toast / refresh.
      publish({
        type: "chat_message_received",
        serviceId: boundService?.id ?? null,
        userEmail: assigneeEmail,
        payload: {
          conversationId,
          senderName,
          preview: messagePreview,
          inbox: payload.conversation?.inbox?.name ?? null,
          ticketNumber: boundService?.ticketNumber ?? null,
        },
      });
      logger.info("chatwoot message_created notified (assignee)", { uid, conv: conversationId });
      await recordWebhookHit("chatwoot", "ok", "message_created");
      return NextResponse.json({ ok: true, boundTicket: boundService?.ticketNumber ?? null });
    }

    // Path B: brak assignee → fan-out do wszystkich agentów inboxa
    // (chatwoot.unread_message). Pomija outgoing i wyłącza tylko gdy inbox_id
    // nie jest dostępne w payload.
    const inboxId = extractInboxId(payload);
    if (!inboxId) {
      logger.info("chatwoot unassigned skipped — no inbox_id", { conversationId });
      await recordWebhookHit("chatwoot", "ignored", "message_created", "no-inbox-id");
      return NextResponse.json({ ok: true, ignored: "no-inbox-id", boundTicket: boundService?.ticketNumber ?? null });
    }
    const agentEmails = await getChatwootInboxAgentEmails(inboxId);
    if (agentEmails.length === 0) {
      logger.info("chatwoot unassigned no agents", { conversationId, inboxId });
      await recordWebhookHit("chatwoot", "ignored", "message_created", "no-inbox-agents");
      return NextResponse.json({ ok: true, ignored: "no-inbox-agents", boundTicket: boundService?.ticketNumber ?? null });
    }
    const uids = await Promise.all(agentEmails.map(getUserIdByEmail));
    const targets = uids.filter((u): u is string => typeof u === "string");
    await Promise.allSettled(
      targets.map((uid) =>
        notifyUser(uid, "chatwoot.unread_message", {
          title: `Nieprzypisana wiadomość w Chatwoot${ticketSuffix}`,
          body: `${senderName}: ${messagePreview}`,
          severity: "info",
          payload: { ...sharedNotifyPayload, inboxId },
        }),
      ),
    );
    logger.info("chatwoot unassigned fanout", { conv: conversationId, count: targets.length });
    await recordWebhookHit("chatwoot", "ok", "message_created", `unassigned-fanout:${targets.length}`);
    return NextResponse.json({ ok: true, fanout: targets.length, boundTicket: boundService?.ticketNumber ?? null });
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
