/**
 * Wave 21 / Faza 1C — wysyłka 6-cyfrowego kodu wydania urządzenia klientowi.
 *
 * Kanały:
 *   - `email`: Postal sendMail z profilem `zlecenieserwisowe` (sender
 *     `caseownia@zlecenieserwisowe.pl`), branding 1:1 z notify-annex.
 *   - `sms`:  Chatwoot Twilio SMS inbox (`CHATWOOT_SMS_INBOX_ID`) — find-or-
 *     create contact po phone, find-or-create conversation w SMS inboxie,
 *     post outgoing → Twilio fire SMS. Wave 22 / F13 fix: wcześniej
 *     `sendServiceMessage` postował do konwersacji w service inboxie
 *     (Channel::Email/WebWidget) i Twilio NIE odpalał — SMS nigdy nie szedł.
 *   - `paper`: no-op — kod tylko w PDF receipt (odpowiedzialność Faza 1H).
 *
 * Helper non-throwing: error jednego kanału nie blokuje POST intake.
 * Wzór 1:1 z `notify-annex.ts` (Wave 20).
 */
import { sendMail } from "@/lib/smtp";
import { sendCustomerSms } from "@/lib/chatwoot-customer";
import { applyLayout } from "@/lib/email/render";
import {
  ensureDefaultLayout,
  getDefaultLayout,
  getLayoutBySlug,
} from "@/lib/email/db/layouts";
import { getBranding } from "@/lib/email/db";
import {
  resolveBrandFromService,
  senderForBrand,
  layoutSlugForBrand,
  type EmailBrand,
} from "@/lib/services/brand";
import { log } from "@/lib/logger";

const logger = log.child({ module: "notify-release-code" });

export type ReleaseNotifyChannel = "email" | "sms" | "paper";

export interface NotifyReleaseCodeInput {
  service: {
    id: string;
    ticketNumber: string;
    contactEmail: string | null;
    contactPhone: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    chatwootConversationId: number | null;
  };
  /** 6-cyfrowy kod plain — tylko do natychmiastowej wysyłki. */
  code: string;
  channel: ReleaseNotifyChannel;
}

export interface NotifyReleaseCodeResult {
  ok: boolean;
  channel: ReleaseNotifyChannel;
  error?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmailContent(input: NotifyReleaseCodeInput): {
  subject: string;
  contentHtml: string;
  contentText: string;
} {
  const { service, code } = input;
  const greeting = service.customerFirstName?.trim()
    ? `Witaj ${service.customerFirstName.trim()},`
    : "Dzień dobry,";
  const subject = `Kod wydania urządzenia — zlecenie #${service.ticketNumber}`;

  const contentHtml = `
<h1 style="font-size:22px;color:#111;margin:0 0 16px;">Kod wydania urządzenia</h1>
<p style="margin:0 0 12px;color:#1a1a1a;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 18px;color:#1a1a1a;font-size:15px;line-height:1.6;">
  Po zakończonej naprawie poprosimy o podanie poniższego 6-cyfrowego kodu przy odbiorze urządzenia
  ze zlecenia <strong>${escapeHtml(service.ticketNumber)}</strong>:
</p>
<div style="text-align:center;margin:24px 0;">
  <div style="display:inline-block;padding:18px 28px;border:2px solid #0c0c0e;border-radius:8px;background:#fafafa;">
    <span style="font-family:'Courier New', Menlo, monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#0c0c0e;">
      ${escapeHtml(code)}
    </span>
  </div>
</div>
<p style="margin:0 0 12px;color:#1a1a1a;font-size:14px;line-height:1.6;">
  Kod jest jednorazowy. Prosimy zachować go w bezpiecznym miejscu — po 5 błędnych próbach możliwość
  użycia kodu zostanie tymczasowo zablokowana na 30 minut.
</p>
<p style="margin:0;color:#555555;font-size:13px;line-height:1.5;">
  Jeśli ten e-mail trafił do Ciebie omyłkowo, zignoruj go.
</p>
`.trim();

  const contentText = [
    greeting,
    "",
    `Kod wydania urządzenia dla zlecenia ${service.ticketNumber}:`,
    "",
    `   ${code}`,
    "",
    "Kod jest jednorazowy. Po 5 błędnych próbach możliwość weryfikacji zostanie",
    "zablokowana na 30 minut.",
    "",
    "Serwis telefonów by Caseownia",
  ].join("\n");

  return { subject, contentHtml, contentText };
}

async function buildLayoutedHtml(
  contentHtml: string,
  brand: EmailBrand,
): Promise<string> {
  // Wave 22 / F1 — layout per brand.
  try {
    await ensureDefaultLayout();
    const layout =
      (await getLayoutBySlug(layoutSlugForBrand(brand)).catch(() => null)) ??
      (await getDefaultLayout());
    if (layout?.html) {
      const branding = await getBranding().catch(() => null);
      const sender = senderForBrand(brand);
      const fallbackBrandName =
        brand === "myperformance" ? "MyPerformance" : sender.fromName;
      const fallbackBrandUrl =
        brand === "myperformance"
          ? "https://myperformance.pl"
          : "https://zlecenieserwisowe.pl";
      const fallbackSupport =
        brand === "myperformance"
          ? "kontakt@myperformance.pl"
          : "biuro@caseownia.com";
      const html = applyLayout(layout.html, contentHtml);
      return html
        .replace(
          /\{\{\s*brand\.name\s*\}\}/g,
          escapeHtml(branding?.brandName ?? fallbackBrandName),
        )
        .replace(
          /\{\{\s*brand\.url\s*\}\}/g,
          escapeHtml(branding?.brandUrl ?? fallbackBrandUrl),
        )
        .replace(
          /\{\{\s*brand\.logoUrl\s*\}\}/g,
          escapeHtml(branding?.brandLogoUrl ?? ""),
        )
        .replace(
          /\{\{\s*brand\.supportEmail\s*\}\}/g,
          escapeHtml(branding?.supportEmail ?? fallbackSupport),
        )
        .replace(/\{\{\s*subject\s*\}\}/g, "")
        .replace(/\{\{\s*content\s*\}\}/g, contentHtml);
    }
  } catch (err) {
    logger.warn("notify-release-code.layout_lookup_failed", {
      err: String(err),
    });
  }
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f4f4f5;padding:24px;"><div style="max-width:600px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;">${contentHtml}</div></body></html>`;
}

async function deliverEmail(
  input: NotifyReleaseCodeInput,
): Promise<NotifyReleaseCodeResult> {
  const { service } = input;
  if (!service.contactEmail) {
    return { ok: false, channel: "email", error: "no_email" };
  }
  try {
    const { subject, contentHtml, contentText } = renderEmailContent(input);
    const brand = await resolveBrandFromService(service.id);
    const html = await buildLayoutedHtml(contentHtml, brand);
    const { fromAddress, fromName } = senderForBrand(brand);
    await sendMail({
      to: service.contactEmail,
      subject,
      html,
      text: contentText,
      fromName,
      fromAddress,
      replyTo: fromAddress,
      profileSlug: brand,
    });
    logger.info("notify-release-code.email_sent", {
      serviceId: service.id,
      ticketNumber: service.ticketNumber,
      brand,
    });
    return { ok: true, channel: "email" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("notify-release-code.email_failed", {
      serviceId: service.id,
      err: msg,
    });
    return { ok: false, channel: "email", error: msg };
  }
}

function buildSmsBody(input: NotifyReleaseCodeInput): string {
  const { service, code } = input;
  return `Caseownia: kod wydania zlecenia #${service.ticketNumber}: ${code}. Kod jednorazowy, prosimy nie udostepniac.`;
}

async function deliverSms(
  input: NotifyReleaseCodeInput,
): Promise<NotifyReleaseCodeResult> {
  const { service } = input;
  if (!service.contactPhone) {
    return { ok: false, channel: "sms", error: "no_phone" };
  }
  try {
    const body = buildSmsBody(input);
    const customerName =
      [service.customerFirstName, service.customerLastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "Klient";
    const result = await sendCustomerSms({
      phone: service.contactPhone,
      customerName,
      body,
      ticketNumber: service.ticketNumber,
      serviceId: service.id,
      customerEmail: service.contactEmail,
    });
    // Wave 22 / F13 — pełen audit log: status code z Chatwoot, conversation
    // id, message id, contact id, inbox id, error tag/detail.
    if (!result.ok) {
      logger.warn("notify-release-code.sms_failed", {
        serviceId: service.id,
        ticketNumber: service.ticketNumber,
        inboxId: result.inboxId,
        contactId: result.contactId,
        conversationId: result.conversationId,
        status: result.status,
        error: result.error,
        detail: result.detail,
      });
      return {
        ok: false,
        channel: "sms",
        error: result.error ?? "chatwoot_send_failed",
      };
    }
    logger.info("notify-release-code.sms_sent", {
      serviceId: service.id,
      ticketNumber: service.ticketNumber,
      inboxId: result.inboxId,
      conversationId: result.conversationId,
      messageId: result.messageId,
      contactId: result.contactId,
      status: result.status,
    });
    return { ok: true, channel: "sms" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("notify-release-code.sms_failed", {
      serviceId: service.id,
      err: msg,
    });
    return { ok: false, channel: "sms", error: msg };
  }
}

/**
 * Wysyła kod kanałem `channel`. Dla `paper` no-op (kod trafi do PDF
 * potwierdzenia odbioru — opt path). Non-throwing.
 */
export async function notifyReleaseCode(
  input: NotifyReleaseCodeInput,
): Promise<NotifyReleaseCodeResult> {
  switch (input.channel) {
    case "email":
      return deliverEmail(input);
    case "sms":
      return deliverSms(input);
    case "paper":
      // Brak ścieżki run-time — kod renderowany w PDF (Faza 1H opt).
      logger.info("notify-release-code.paper_noop", {
        serviceId: input.service.id,
        ticketNumber: input.service.ticketNumber,
      });
      return { ok: true, channel: "paper" };
  }
}
