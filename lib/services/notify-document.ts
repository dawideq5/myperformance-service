/**
 * Wave 21 / Faza 1B — custom notyfikacje per rodzaj dokumentu zlecenia.
 *
 * Documenso v3 z `distributionMethod=NONE` (Wave 21) NIE wysyła sam żadnych
 * maili. Po `createDocumentForSigning` to my odpalamy własny invitation z
 * brandingiem Caseownia (sender `caseownia@zlecenieserwisowe.pl`, profile
 * SMTP `zlecenieserwisowe`, layout DEFAULT_LAYOUT_HTML 1:1).
 *
 * Funkcje:
 *   - `notifyAnnexCreated(...)` — Wave 20 funkcja jest re-exported z
 *     `notify-annex.ts` (zachowanie kompatybilności wstecz).
 *   - `notifyDocumentForSigning({document, service, signingUrl, ...})` —
 *     ogólny invitation do podpisu (employee + customer flow). Używany dla
 *     dokumentów innych niż aneks (handover, custom...). Załącza PDF
 *     oryginał gdy podany.
 *   - `notifyReceiptSigned({service, document, pdfBuffer})` — po podpisaniu
 *     potwierdzenia wysyła klientowi e-potwierdzenie z załącznikiem PDF.
 *     Wave 21 / Faza 1C dorzuci kod wydania w treści.
 *
 * Wszystkie helpery są non-throwing (audit logging w lib/logger).
 */
import { sendMail } from "@/lib/smtp";
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
import type { ServiceDocument } from "@/lib/service-documents";

export { notifyAnnexCreated } from "@/lib/services/notify-annex";

const logger = log.child({ module: "notify-document" });

/** Escape HTML — wzór z notify-annex. Zostawione lokalne żeby uniknąć cross-importu. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Rozwija content w layout per brand (czarny header z brand wordmarkiem +
 * footer). Najpierw próbuje layout o slug = brand; gdy nie istnieje fallback
 * do default layout (DEFAULT_LAYOUT_HTML z `mp_email_layouts`).
 *
 * Wave 22 / F1 — przyjmuje brand parameter, przedtem hardcoded "zlecenieserwisowe". */
async function buildLayoutedHtml(
  contentHtml: string,
  brand: EmailBrand,
): Promise<string> {
  try {
    await ensureDefaultLayout();
    const layout =
      (await getLayoutBySlug(layoutSlugForBrand(brand)).catch(() => null)) ??
      (await getDefaultLayout());
    if (layout?.html) {
      const branding = await getBranding().catch(() => null);
      const sender = senderForBrand(brand);
      const html = applyLayout(layout.html, contentHtml);
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
    logger.warn("notify-document.layout_lookup_failed", {
      brand,
      err: String(err),
    });
  }
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f4f4f5;padding:24px;"><div style="max-width:600px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;">${contentHtml}</div></body></html>`;
}

export interface NotifyDocumentForSigningInput {
  service: {
    id: string;
    ticketNumber: string | null;
    contactEmail: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
  };
  document: Pick<ServiceDocument, "id" | "kind" | "title">;
  /** Link do podpisu (Documenso signing URL dla klienta). Wymagany. */
  signingUrl: string;
  /** Załącznik z oryginałem PDF (do wglądu przed podpisem). Opcjonalny. */
  pdfBuffer?: Buffer;
  /** Override default subject (gdy null = computed z kind+ticket). */
  subjectOverride?: string;
}

const KIND_LABEL: Record<string, string> = {
  receipt: "potwierdzenia przyjęcia",
  annex: "aneksu",
  handover: "protokołu wydania",
  release_code: "kodu wydania",
  warranty: "karty gwarancyjnej",
  other: "dokumentu",
};

export async function notifyDocumentForSigning(
  input: NotifyDocumentForSigningInput,
): Promise<{ ok: boolean; error?: string }> {
  const { service, document, signingUrl, pdfBuffer, subjectOverride } = input;
  if (!service.contactEmail) return { ok: false, error: "no_email" };
  try {
    const greeting = service.customerFirstName?.trim()
      ? `Witaj ${service.customerFirstName.trim()},`
      : "Dzień dobry,";
    const kindLabel = KIND_LABEL[document.kind] ?? "dokumentu";
    const ticketDisplay = service.ticketNumber ?? "—";
    const subject =
      subjectOverride ??
      `Prośba o podpis ${kindLabel} — zlecenie ${ticketDisplay}`;
    const title = document.title?.trim() ?? "Dokument do podpisu";

    const contentHtml = `
<h1 style="font-size:22px;color:#111;margin:0 0 16px;">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">
  Przygotowaliśmy ${escapeHtml(kindLabel)} do zlecenia <strong>${escapeHtml(ticketDisplay)}</strong>.
  Prosimy o podpisanie elektroniczne — zajmie to mniej niż minutę.
</p>
<div style="text-align:center;margin:24px 0;">
  <a href="${escapeHtml(signingUrl)}"
     style="display:inline-block;padding:14px 28px;background:#0c0c0e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
    Podpisz dokument online
  </a>
</div>
<p style="margin:0;color:#555555;font-size:13px;line-height:1.5;">
  W razie pytań możesz odpowiedzieć na tę wiadomość — odpiszemy najszybciej, jak to możliwe.
</p>
`.trim();

    const contentText = [
      greeting,
      "",
      `Prośba o podpis ${kindLabel} — zlecenie ${ticketDisplay}.`,
      `Podpisz online: ${signingUrl}`,
      "",
      "Serwis telefonów by Caseownia",
    ].join("\n");

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
      ...(pdfBuffer
        ? {
            attachments: [
              {
                filename: `${title.replace(/[^a-z0-9_-]+/gi, "-")}-${ticketDisplay}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ],
          }
        : {}),
    });
    logger.info("notify-document.signing_invitation_sent", {
      serviceId: service.id,
      documentId: document.id,
      kind: document.kind,
      brand,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("notify-document.signing_invitation_failed", {
      serviceId: service.id,
      documentId: document.id,
      err: msg,
    });
    return { ok: false, error: msg };
  }
}

export interface NotifyReceiptSignedInput {
  service: {
    id: string;
    ticketNumber: string | null;
    contactEmail: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
  };
  document: Pick<ServiceDocument, "id" | "kind" | "title">;
  /** Bytes podpisanej wersji PDF (z Documenso COMPLETED). Opcjonalne — gdy
   * brak, wysyłamy tylko notyfikację bez załącznika. */
  pdfBuffer?: Buffer;
}

/**
 * Powiadomienie klienta po podpisaniu potwierdzenia (receipt). Wysyłka
 * klasyczna — finalny PDF w załączniku, krótki tekst potwierdzający.
 * Wave 21 / Faza 1C dorzuci kod wydania (release_code) do treści gdy
 * `service.releaseCode` ustawione (deferred).
 */
export async function notifyReceiptSigned(
  input: NotifyReceiptSignedInput,
): Promise<{ ok: boolean; error?: string }> {
  const { service, document, pdfBuffer } = input;
  if (!service.contactEmail) return { ok: false, error: "no_email" };
  try {
    const greeting = service.customerFirstName?.trim()
      ? `Witaj ${service.customerFirstName.trim()},`
      : "Dzień dobry,";
    const ticketDisplay = service.ticketNumber ?? "—";
    const subject = `Potwierdzenie przyjęcia podpisane — zlecenie ${ticketDisplay}`;
    const contentHtml = `
<h1 style="font-size:22px;color:#111;margin:0 0 16px;">Dziękujemy za podpis</h1>
<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">
  Otrzymaliśmy Twój podpis pod potwierdzeniem przyjęcia urządzenia (zlecenie
  <strong>${escapeHtml(ticketDisplay)}</strong>). W załączniku znajdziesz finalną wersję dokumentu.
</p>
<p style="margin:0 0 16px;color:#1a1a1a;font-size:15px;line-height:1.6;">
  Będziemy informować Cię o postępach naprawy. W razie pytań możesz odpowiedzieć na tę wiadomość.
</p>
<p style="margin:0;color:#555555;font-size:13px;line-height:1.5;">
  Serwis Telefonów by Caseownia
</p>
`.trim();
    const contentText = [
      greeting,
      "",
      `Otrzymaliśmy Twój podpis pod potwierdzeniem przyjęcia (zlecenie ${ticketDisplay}).`,
      "Finalny PDF jest w załączniku.",
      "",
      "Serwis Telefonów by Caseownia",
    ].join("\n");

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
      ...(pdfBuffer
        ? {
            attachments: [
              {
                filename: `Potwierdzenie-${ticketDisplay}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ],
          }
        : {}),
    });
    logger.info("notify-document.receipt_signed_sent", {
      serviceId: service.id,
      documentId: document.id,
      brand,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("notify-document.receipt_signed_failed", {
      serviceId: service.id,
      documentId: document.id,
      err: msg,
    });
    return { ok: false, error: msg };
  }
}
