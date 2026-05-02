/**
 * Wysyłka nowej wiadomości do klienta — Wave 20 / Faza 1F.
 *
 * POST `/api/panel/services/[id]/customer-messages`
 *   body: { channel: "sms" | "email" | "chatwoot", subject?: string, body: string }
 *
 * Trzy kanały:
 *   - "email"    → `lib/smtp.ts:sendMail` z templated layoutem (default
 *                  layout z mp_email_layouts + branding context).
 *                  Profil SMTP: "myperformance" (default).
 *   - "sms"      → Chatwoot Twilio SMS inbox (`CHATWOOT_SMS_INBOX_ID`),
 *                  contact lookup po `service.contactPhone`, create gdy
 *                  brak. Pierwsza wiadomość = `body`.
 *   - "chatwoot" → service inbox (`CHATWOOT_SERVICE_INBOX_ID` = id 8 z
 *                  Faza 1C Wave 19); contact po phone/email; metadata
 *                  `ticket_number` w custom_attributes.
 *
 * Auth: panel KC + userOwns(service, locationIds).
 * Rate limits per (user, channel):
 *   - email:    5 / min
 *   - sms:      3 / min
 *   - chatwoot: 10 / min (więcej bo internal-style notify)
 *
 * Audit: logServiceAction `customer_message_sent` + SSE publish
 * `customer_message_sent` → service.id channel.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, type ServiceTicket } from "@/lib/services";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import { publish } from "@/lib/sse-bus";
import { sendMail } from "@/lib/smtp";
import {
  applyLayout,
  markdownToHtml,
  renderVars,
} from "@/lib/email/render";
import { getDefaultLayout, getBranding } from "@/lib/email/db";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-customer-messages" });

type Channel = "sms" | "email" | "chatwoot";

interface PostBody {
  channel?: Channel;
  subject?: string;
  body?: string;
}

const CHANNEL_LIMITS: Record<Channel, { capacity: number; refillPerSec: number }> = {
  email: { capacity: 5, refillPerSec: 5 / 60 },
  sms: { capacity: 3, refillPerSec: 3 / 60 },
  chatwoot: { capacity: 10, refillPerSec: 10 / 60 },
};

const CHANNEL_BODY_MAX: Record<Channel, number> = {
  sms: 1000, // pozwalamy na multipart, walidacja UI ostrzega 160
  email: 10_000,
  chatwoot: 4_000,
};

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId)) return true;
  if (
    service.serviceLocationId &&
    locationIds.includes(service.serviceLocationId)
  )
    return true;
  return false;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

interface ChatwootCtx {
  baseUrl: string;
  platformToken: string;
  accountId: number;
}

function getChatwootCtx(): ChatwootCtx | null {
  const baseUrl = (getOptionalEnv("CHATWOOT_URL") ?? "").trim().replace(/\/$/, "");
  const platformToken = (getOptionalEnv("CHATWOOT_PLATFORM_TOKEN") ?? "").trim();
  const accountIdRaw = (getOptionalEnv("CHATWOOT_ACCOUNT_ID") ?? "1").trim();
  if (!baseUrl || !platformToken) return null;
  const accountId = Number(accountIdRaw);
  if (!Number.isFinite(accountId)) return null;
  return { baseUrl, platformToken, accountId };
}

async function chatwootFetch(
  cfg: ChatwootCtx,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      api_access_token: cfg.platformToken,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

interface ContactSearchResult {
  payload?: Array<{ id: number }>;
}

async function findOrCreateContact(
  cfg: ChatwootCtx,
  args: {
    name: string;
    phone?: string | null;
    email?: string | null;
    inboxId: number;
  },
): Promise<number | null> {
  const ident = (args.phone || args.email || "").trim();
  if (!ident) return null;
  // Search.
  try {
    const r = await chatwootFetch(
      cfg,
      `/api/v1/accounts/${cfg.accountId}/contacts/search?q=${encodeURIComponent(ident)}`,
    );
    if (r.ok) {
      const data = (await r.json()) as ContactSearchResult;
      const found = data.payload?.[0];
      if (found?.id) return found.id;
    }
  } catch (err) {
    logger.warn("contact search failed", { err: String(err) });
  }
  // Create.
  try {
    const body: Record<string, unknown> = {
      name: args.name,
      identifier: `mp-svc-${ident}`,
      inbox_id: args.inboxId,
    };
    if (args.phone) body.phone_number = args.phone;
    if (args.email) body.email = args.email;
    const r = await chatwootFetch(
      cfg,
      `/api/v1/accounts/${cfg.accountId}/contacts`,
      { method: "POST", body: JSON.stringify(body) },
    );
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      logger.warn("contact create failed", {
        status: r.status,
        body: text.slice(0, 200),
      });
      return null;
    }
    const data = (await r.json()) as { payload?: { contact?: { id: number } } };
    return data.payload?.contact?.id ?? null;
  } catch (err) {
    logger.warn("contact create error", { err: String(err) });
    return null;
  }
}

interface SendChatwootArgs {
  inboxId: number;
  contactId: number;
  body: string;
  ticketNumber: string;
  serviceId: string;
}

async function createConversationAndSend(
  cfg: ChatwootCtx,
  args: SendChatwootArgs,
): Promise<number | null> {
  const r = await chatwootFetch(
    cfg,
    `/api/v1/accounts/${cfg.accountId}/conversations`,
    {
      method: "POST",
      body: JSON.stringify({
        source_id: `mp-svc-${args.ticketNumber}-${Date.now()}`,
        inbox_id: args.inboxId,
        contact_id: args.contactId,
        status: "open",
        message: { content: args.body, message_type: "outgoing" },
        additional_attributes: {
          ticket_number: args.ticketNumber,
          service_id: args.serviceId,
          source: "mp-services-panel",
        },
        custom_attributes: {
          ticket_number: args.ticketNumber,
          service_id: args.serviceId,
        },
      }),
    },
  );
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    logger.warn("conversation create failed", {
      status: r.status,
      body: text.slice(0, 200),
    });
    return null;
  }
  const data = (await r.json()) as { id?: number };
  return data?.id ?? null;
}

async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
  service: ServiceTicket;
}): Promise<{ messageId: string }> {
  const layout = await getDefaultLayout();
  const branding = await getBranding();
  const customerName = [
    args.service.customerFirstName,
    args.service.customerLastName,
  ]
    .filter(Boolean)
    .join(" ");
  const ctx: Record<string, unknown> = {
    brand: {
      name: branding.brandName,
      url: branding.brandUrl ?? "https://myperformance.pl",
      logoUrl: branding.brandLogoUrl ?? "",
      supportEmail: branding.supportEmail ?? "support@myperformance.pl",
      legalName: branding.legalName ?? branding.brandName,
    },
    service: {
      ticketNumber: args.service.ticketNumber,
      brand: args.service.brand ?? "",
      model: args.service.model ?? "",
    },
    customer: { name: customerName || "Kliencie" },
    subject: args.subject,
  };
  const renderedSubject = renderVars(args.subject, ctx);
  const renderedBodyText = renderVars(args.body, ctx);
  const renderedBodyHtml = markdownToHtml(renderedBodyText);
  const rawLayoutHtml = layout
    ? layout.html
    : `<html><body>{{content}}</body></html>`;
  const withContent = applyLayout(rawLayoutHtml, renderedBodyHtml);
  const finalCtx = { ...ctx, subject: renderedSubject };
  const html = renderVars(withContent, finalCtx);
  return await sendMail({
    to: args.to,
    subject: renderedSubject,
    html,
    text: renderedBodyText,
    profileSlug: "myperformance",
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id } = await params;
  const service = await getService(id);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  const channel = body?.channel;
  const messageBody = (body?.body ?? "").trim();
  const subjectRaw = (body?.subject ?? "").trim();

  if (!channel || !["sms", "email", "chatwoot"].includes(channel)) {
    return NextResponse.json(
      { error: "Pole `channel` musi być sms | email | chatwoot" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!messageBody) {
    return NextResponse.json(
      { error: "Pole `body` jest wymagane" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const max = CHANNEL_BODY_MAX[channel];
  if (messageBody.length > max) {
    return NextResponse.json(
      { error: `Wiadomość przekracza ${max} znaków dla kanału ${channel}` },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // Rate limit per (channel, user).
  const limit = CHANNEL_LIMITS[channel];
  const rl = rateLimit(`svc-msg:${channel}:${user.email}`, limit);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error:
          channel === "sms"
            ? "Limit SMS — maks 3 / min. Spróbuj za chwilę."
            : channel === "email"
              ? "Limit email — maks 5 / min. Spróbuj za chwilę."
              : "Limit wiadomości — maks 10 / min.",
      },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const customerName =
    [service.customerFirstName, service.customerLastName]
      .filter(Boolean)
      .join(" ") || "Klient";

  try {
    if (channel === "email") {
      const to = (service.contactEmail ?? "").trim();
      if (!to) {
        return NextResponse.json(
          { error: "Brak adresu e-mail klienta" },
          { status: 400, headers: PANEL_CORS_HEADERS },
        );
      }
      const subject =
        subjectRaw || `Wiadomość do zlecenia ${service.ticketNumber}`;
      const result = await sendEmail({
        to,
        subject,
        body: messageBody,
        service,
      });

      void logServiceAction({
        serviceId: id,
        ticketNumber: service.ticketNumber,
        action: "customer_message_sent",
        actor: { email: user.email, name: user.name ?? user.email },
        summary: `Wysłano email do klienta (${to})`,
        payload: {
          channel: "email",
          length: messageBody.length,
          to,
          subject,
          messageId: result.messageId,
        },
      });

      publish({
        type: "customer_message_sent",
        serviceId: id,
        payload: {
          channel: "email",
          to,
          subject,
          ticketNumber: service.ticketNumber,
          actorEmail: user.email,
          messageId: result.messageId,
        },
      });

      return NextResponse.json(
        { ok: true, channel, externalId: result.messageId },
        { status: 201, headers: PANEL_CORS_HEADERS },
      );
    }

    if (channel === "sms" || channel === "chatwoot") {
      const cfg = getChatwootCtx();
      if (!cfg) {
        return NextResponse.json(
          { error: "Chatwoot nie skonfigurowany (CHATWOOT_URL/TOKEN)" },
          { status: 503, headers: PANEL_CORS_HEADERS },
        );
      }

      const inboxEnv =
        channel === "sms"
          ? getOptionalEnv("CHATWOOT_SMS_INBOX_ID")
          : getOptionalEnv("CHATWOOT_SERVICE_INBOX_ID");
      const inboxId = inboxEnv ? Number(inboxEnv) : NaN;
      if (!Number.isFinite(inboxId)) {
        return NextResponse.json(
          {
            error:
              channel === "sms"
                ? "CHATWOOT_SMS_INBOX_ID nie ustawione"
                : "CHATWOOT_SERVICE_INBOX_ID nie ustawione",
          },
          { status: 503, headers: PANEL_CORS_HEADERS },
        );
      }

      // Walidacja danych klienta po kanale.
      if (channel === "sms" && !service.contactPhone) {
        return NextResponse.json(
          { error: "Brak numeru telefonu klienta" },
          { status: 400, headers: PANEL_CORS_HEADERS },
        );
      }
      if (channel === "chatwoot" && !service.contactPhone && !service.contactEmail) {
        return NextResponse.json(
          { error: "Brak telefonu i emaila klienta — nie da się utworzyć kontaktu" },
          { status: 400, headers: PANEL_CORS_HEADERS },
        );
      }

      const contactId = await findOrCreateContact(cfg, {
        name: customerName,
        phone: channel === "sms" ? service.contactPhone : service.contactPhone,
        email: channel === "sms" ? null : service.contactEmail,
        inboxId,
      });
      if (!contactId) {
        return NextResponse.json(
          { error: "Nie udało się utworzyć kontaktu w Chatwoot" },
          { status: 502, headers: PANEL_CORS_HEADERS },
        );
      }

      const conversationId = await createConversationAndSend(cfg, {
        inboxId,
        contactId,
        body: messageBody,
        ticketNumber: service.ticketNumber,
        serviceId: id,
      });
      if (!conversationId) {
        return NextResponse.json(
          { error: "Nie udało się utworzyć rozmowy w Chatwoot" },
          { status: 502, headers: PANEL_CORS_HEADERS },
        );
      }

      void logServiceAction({
        serviceId: id,
        ticketNumber: service.ticketNumber,
        action: "customer_message_sent",
        actor: { email: user.email, name: user.name ?? user.email },
        summary:
          channel === "sms"
            ? `Wysłano SMS do klienta (${service.contactPhone})`
            : `Wysłano wiadomość Chatwoot do klienta`,
        payload: {
          channel,
          length: messageBody.length,
          contactId,
          conversationId,
          inboxId,
          phone: service.contactPhone ?? null,
          email: service.contactEmail ?? null,
        },
      });

      publish({
        type: "customer_message_sent",
        serviceId: id,
        payload: {
          channel,
          conversationId,
          contactId,
          ticketNumber: service.ticketNumber,
          actorEmail: user.email,
        },
      });

      return NextResponse.json(
        { ok: true, channel, externalId: conversationId },
        { status: 201, headers: PANEL_CORS_HEADERS },
      );
    }

    // Unreachable — channel zwalidowany powyżej.
    return NextResponse.json(
      { error: "Unsupported channel" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("customer message send failed", {
      serviceId: id,
      channel,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: "Nie udało się wysłać wiadomości",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
