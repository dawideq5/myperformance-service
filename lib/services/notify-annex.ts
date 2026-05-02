/**
 * Wave 20 / Faza 1A — powiadomienie klienta o utworzonym aneksie.
 *
 * Po POST /api/panel/services/[id]/annex (success) backend wywołuje
 * `notifyAnnexCreated({ service, annex, pdfBuffer, channels })` która
 * fan-outuje:
 *   - email do `service.contactEmail` (gdy podany) z załączonym PDF aneksu
 *     i krótkim CTA (link do Documenso gdy `documensoSigningUrl`),
 *   - SMS przez Chatwoot — wykorzystujemy istniejące `chatwootConversationId`
 *     na zleceniu (Twilio SMS inbox jest podpięty pod Chatwoot, więc message
 *     wysyłana w outgoing kierunku trafia do klienta jako SMS).
 *
 * Helper jest non-throwing — błąd jednego kanału nie blokuje drugiego ani
 * nie psuje response z parent route. Zwraca bool flags per channel.
 *
 * Wybór SMTP profilu: zawsze `zlecenieserwisowe` (brand Caseownia, NIE
 * MyPerformance), zgodnie z konwencją signed-receipt webhook handlerów.
 */
import { sendMail } from "@/lib/smtp";
import { sendServiceMessage } from "@/lib/chatwoot-customer";
import { applyLayout } from "@/lib/email/render";
import {
  ensureDefaultLayout,
  getDefaultLayout,
} from "@/lib/email/db/layouts";
import { getBranding } from "@/lib/email/db";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import type { ServiceAnnex } from "@/lib/service-annexes";

const logger = log.child({ module: "notify-annex" });

export type NotifyAnnexChannel = "email" | "sms";

export interface NotifyAnnexInput {
  service: {
    id: string;
    ticketNumber: string;
    contactEmail: string | null;
    contactPhone: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    chatwootConversationId: number | null;
  };
  annex: ServiceAnnex;
  /** Załącznik PDF aneksu — generowany w parent route z renderAnnexPdf. */
  pdfBuffer: Buffer;
  /** Kanały do użycia. Default: ["email", "sms"]. */
  channels?: NotifyAnnexChannel[];
}

export interface NotifyAnnexResult {
  emailSent: boolean;
  smsSent: boolean;
  emailError?: string;
  smsError?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function methodLabel(method: ServiceAnnex["acceptanceMethod"]): string {
  switch (method) {
    case "documenso":
      return "elektroniczna akceptacja przez link Documenso";
    case "phone":
      return "akceptacja telefoniczna podczas rozmowy z naszym konsultantem";
    case "email":
      return "akceptacja e-mail (proszę o odpowiedź potwierdzającą)";
  }
}

function renderEmailContent(input: NotifyAnnexInput): {
  subject: string;
  contentHtml: string;
  contentText: string;
} {
  const { service, annex } = input;
  const greeting = service.customerFirstName?.trim()
    ? `Witaj ${service.customerFirstName.trim()},`
    : "Dzień dobry,";
  const subject = `Aneks do zlecenia ${service.ticketNumber} — Serwis telefonów by Caseownia`;

  const deltaSign = annex.deltaAmount >= 0 ? "+" : "";
  const deltaText = `${deltaSign}${annex.deltaAmount.toFixed(2)} PLN`;
  const ctaSection =
    annex.acceptanceMethod === "documenso" && annex.documensoSigningUrl
      ? `<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">
  Aby zaakceptować zmianę wyceny, podpisz aneks elektronicznie:
</p>
<div style="text-align:center;margin:24px 0;">
  <a href="${escapeHtml(annex.documensoSigningUrl)}"
     style="display:inline-block;padding:14px 28px;background:#0c0c0e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
    Podpisz aneks online
  </a>
</div>`
      : `<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">
  Sposób akceptacji: <strong>${escapeHtml(methodLabel(annex.acceptanceMethod))}</strong>.
</p>`;

  const contentHtml = `
<h1 style="font-size:22px;color:#111;margin:0 0 16px;">Aneks do zlecenia ${escapeHtml(service.ticketNumber)}</h1>
<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">
  W trakcie naprawy Twojego urządzenia pojawiła się konieczność zmiany pierwotnej wyceny.
  W załączeniu przesyłamy aneks (PDF) z pełnym uzasadnieniem.
</p>
<table role="presentation" style="border-collapse:collapse;margin:0 0 20px;">
  <tr>
    <td style="padding:6px 12px 6px 0;color:#555555;font-size:13px;">Powód zmiany:</td>
    <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${escapeHtml(annex.reason)}</td>
  </tr>
  <tr>
    <td style="padding:6px 12px 6px 0;color:#555555;font-size:13px;">Różnica (delta):</td>
    <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${escapeHtml(deltaText)}</td>
  </tr>
</table>
${ctaSection}
<p style="margin:0;color:#555555;font-size:13px;line-height:1.5;">
  W razie pytań możesz odpowiedzieć na tę wiadomość — odpiszemy najszybciej jak to możliwe.
</p>
`.trim();

  const contentText = [
    greeting,
    "",
    `Aneks do zlecenia ${service.ticketNumber}.`,
    `Powód: ${annex.reason}`,
    `Delta: ${deltaText}`,
    `Sposób akceptacji: ${methodLabel(annex.acceptanceMethod)}`,
    annex.acceptanceMethod === "documenso" && annex.documensoSigningUrl
      ? `Podpisz online: ${annex.documensoSigningUrl}`
      : "",
    "",
    "Serwis telefonów by Caseownia",
  ]
    .filter((s) => s.length > 0)
    .join("\n");

  return { subject, contentHtml, contentText };
}

async function buildLayoutedHtml(contentHtml: string): Promise<string> {
  // Best-effort: użyj zlecenieserwisowe layoutu (DEFAULT_LAYOUT_HTML 1:1
  // dla maili Caseownia). Gdy DB niedostępne — fallback do prostego
  // wrappera tylko z escape'd zawartością.
  try {
    await ensureDefaultLayout();
    // Używamy global default layout (DEFAULT_LAYOUT_HTML zdefiniowany w
    // `lib/email/db/layouts.ts`) — czarny header, slot {{content}}, footer
    // z support email. Specyficzny per-brand override (slug
    // 'zlecenieserwisowe') byłby preferowany ale lookup po slug-u nie ma
    // dedykowanego helpera, a default layout jest 1:1 zgodny ze specyfikacją.
    const def = await getDefaultLayout();
    if (def?.html) {
      const branding = await getBranding().catch(() => null);
      // Layout zawiera placeholdery {{brand.name}}, {{brand.url}}, etc.
      // Renderujemy je tu inline, bez pełnego renderTemplate (który wymaga
      // action key z catalogu).
      const html = applyLayout(def.html, contentHtml);
      return html
        .replace(/\{\{\s*brand\.name\s*\}\}/g, escapeHtml(branding?.brandName ?? "Serwis telefonów by Caseownia"))
        .replace(
          /\{\{\s*brand\.url\s*\}\}/g,
          escapeHtml(branding?.brandUrl ?? "https://zlecenieserwisowe.pl"),
        )
        .replace(
          /\{\{\s*brand\.logoUrl\s*\}\}/g,
          escapeHtml(branding?.brandLogoUrl ?? ""),
        )
        .replace(
          /\{\{\s*brand\.supportEmail\s*\}\}/g,
          escapeHtml(branding?.supportEmail ?? "biuro@caseownia.com"),
        )
        .replace(/\{\{\s*subject\s*\}\}/g, "")
        .replace(/\{\{\s*content\s*\}\}/g, contentHtml);
    }
  } catch (err) {
    logger.warn("notify-annex.layout_lookup_failed", { err: String(err) });
  }
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f4f4f5;padding:24px;"><div style="max-width:600px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;">${contentHtml}</div></body></html>`;
}

async function deliverEmail(input: NotifyAnnexInput): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { service, annex, pdfBuffer } = input;
  if (!service.contactEmail) {
    return { ok: false, error: "no_email" };
  }
  try {
    const { subject, contentHtml, contentText } = renderEmailContent(input);
    const html = await buildLayoutedHtml(contentHtml);
    const fromAddress =
      getOptionalEnv("CONFIRMATION_EMAIL_FROM", "").trim() ||
      "caseownia@zlecenieserwisowe.pl";
    const fromName =
      getOptionalEnv("CONFIRMATION_EMAIL_FROM_NAME", "").trim() ||
      "Serwis Telefonów by Caseownia";
    await sendMail({
      to: service.contactEmail,
      subject,
      html,
      text: contentText,
      fromName,
      fromAddress,
      replyTo: fromAddress,
      profileSlug: "zlecenieserwisowe",
      attachments: [
        {
          filename: `Aneks-${service.ticketNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    logger.info("notify-annex.email_sent", {
      serviceId: service.id,
      ticketNumber: service.ticketNumber,
      annexId: annex.id,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("notify-annex.email_failed", {
      serviceId: service.id,
      annexId: annex.id,
      err: msg,
    });
    return { ok: false, error: msg };
  }
}

function buildSmsBody(input: NotifyAnnexInput): string {
  const { service, annex } = input;
  const sign = annex.deltaAmount >= 0 ? "+" : "";
  const delta = `${sign}${annex.deltaAmount.toFixed(2)} PLN`;
  if (annex.acceptanceMethod === "documenso" && annex.documensoSigningUrl) {
    return `Caseownia: aneks ${service.ticketNumber} (${delta}) czeka na akceptacje. Podpisz: ${annex.documensoSigningUrl}`;
  }
  if (annex.acceptanceMethod === "phone") {
    return `Caseownia: aneks ${service.ticketNumber} (${delta}). Skontaktujemy sie wkrotce telefonicznie w celu akceptacji.`;
  }
  return `Caseownia: aneks ${service.ticketNumber} (${delta}) zostal wystawiony. Sprawdz e-mail po szczegoly i potwierdz akceptacje.`;
}

async function deliverSms(input: NotifyAnnexInput): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { service, annex } = input;
  if (!service.chatwootConversationId) {
    return { ok: false, error: "no_chatwoot_conversation" };
  }
  if (!service.contactPhone) {
    return { ok: false, error: "no_phone" };
  }
  try {
    const body = buildSmsBody(input);
    const ok = await sendServiceMessage(service.chatwootConversationId, body);
    if (!ok) {
      return { ok: false, error: "chatwoot_send_failed" };
    }
    logger.info("notify-annex.sms_sent", {
      serviceId: service.id,
      ticketNumber: service.ticketNumber,
      annexId: annex.id,
      conversationId: service.chatwootConversationId,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("notify-annex.sms_failed", {
      serviceId: service.id,
      annexId: annex.id,
      err: msg,
    });
    return { ok: false, error: msg };
  }
}

export async function notifyAnnexCreated(
  input: NotifyAnnexInput,
): Promise<NotifyAnnexResult> {
  const channels = input.channels ?? ["email", "sms"];
  const result: NotifyAnnexResult = { emailSent: false, smsSent: false };

  if (channels.includes("email")) {
    const r = await deliverEmail(input);
    result.emailSent = r.ok;
    if (!r.ok) result.emailError = r.error;
  }
  if (channels.includes("sms")) {
    const r = await deliverSms(input);
    result.smsSent = r.ok;
    if (!r.ok) result.smsError = r.error;
  }
  return result;
}
