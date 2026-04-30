/**
 * Renderer maila "kopia podpisanego potwierdzenia" wysyłanego do klienta
 * po DOCUMENT_COMPLETED. Brand = Caseownia / Serwis telefonów (NIE
 * MyPerformance).
 *
 * Layout: prosty inline-styled HTML email. Logo Caseownia w nagłówku,
 * tekst, kontakt do punktu serwisowego (telefon dynamiczny z mp_locations).
 *
 * Po wdrożeniu admin/email DB-based templates ten szablon zostanie
 * przeniesiony do mp_email_templates pod kluczem
 * `documents.confirmation_signed`. Aktualnie inline żeby nie wymagać
 * pełnej infrastruktury templating engine na webhook hot-path.
 */

import { getRequiredEnv } from "@/lib/env";

const BRAND_NAME = "Serwis Telefonów by Caseownia";
// Fail-closed: brak BRAND_URL = wywal explicit error przy renderze maila
// (lepiej zwrócić 500 niż wysłać mail z linkiem do losowego URL).
function brandUrl(): string {
  return getRequiredEnv("BRAND_URL");
}
// Logo serwowane przez dashboard (publiczne /logos/*). Klient maila
// załaduje obraz po otwarciu wiadomości.
const LOGO_URL = "https://myperformance.pl/logos/serwis-by-caseownia.png";
const PRIMARY_COLOR = "#0EA5E9";
const TEXT_COLOR = "#1a1a1a";
const MUTED_COLOR = "#6b7280";
const BORDER_COLOR = "#e5e7eb";
const BG_COLOR = "#f8fafc";

export interface SignedReceiptEmailInput {
  customerFirstName: string | null;
  ticketNumber: string | null;
  /** Telefon punktu serwisowego do którego trafia urządzenie. Pokazujemy
   * w treści maila jako kontakt. Null = sekcja telefonu pominięta. */
  serviceLocationPhone: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderSignedReceiptEmail(
  input: SignedReceiptEmailInput,
): RenderedEmail {
  const url = brandUrl();
  const greeting = input.customerFirstName?.trim()
    ? `Witaj ${input.customerFirstName.trim()},`
    : "Dzień dobry,";
  const ticketSuffix = input.ticketNumber
    ? ` <strong>${escapeHtml(input.ticketNumber)}</strong>`
    : "";
  const subject = input.ticketNumber
    ? `Kopia podpisanego potwierdzenia ${input.ticketNumber}`
    : "Kopia podpisanego potwierdzenia";

  const phoneBlock = input.serviceLocationPhone
    ? `<p style="margin:0 0 8px;color:${TEXT_COLOR};font-size:15px;line-height:1.6;">
  Status zlecenia możesz śledzić na
  <a href="${url}" style="color:${PRIMARY_COLOR};text-decoration:none;font-weight:600;">${stripScheme(url)}</a>
  lub skontaktować się pod numerem
  <a href="tel:${digitsOnly(input.serviceLocationPhone)}" style="color:${PRIMARY_COLOR};text-decoration:none;font-weight:600;">${escapeHtml(input.serviceLocationPhone)}</a>.
</p>`
    : `<p style="margin:0 0 8px;color:${TEXT_COLOR};font-size:15px;line-height:1.6;">
  Status zlecenia możesz śledzić na
  <a href="${url}" style="color:${PRIMARY_COLOR};text-decoration:none;font-weight:600;">${stripScheme(url)}</a>.
</p>`;

  const html = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT_COLOR};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid ${BORDER_COLOR};">
        <tr>
          <td style="padding:32px 32px 24px;border-bottom:1px solid ${BORDER_COLOR};text-align:center;">
            <img src="${LOGO_URL}" alt="${escapeHtml(BRAND_NAME)}" style="max-height:56px;width:auto;display:inline-block;" />
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px;">
            <h1 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:20px;font-weight:700;line-height:1.4;">
              Potwierdzenie odbioru urządzenia
            </h1>
            <p style="margin:0 0 16px;color:${TEXT_COLOR};font-size:15px;line-height:1.6;">
              ${greeting}
            </p>
            <p style="margin:0 0 16px;color:${TEXT_COLOR};font-size:15px;line-height:1.6;">
              W załączniku znajdziesz podpisaną kopię potwierdzenia odbioru urządzenia${ticketSuffix}. Dokument zawiera podpisy obu stron i pełen audyt z usługi Documenso.
            </p>
            ${phoneBlock}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 32px;border-top:1px solid ${BORDER_COLOR};text-align:center;">
            <p style="margin:0;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
              ${escapeHtml(BRAND_NAME)} · UNIKOM S.C., ul. Towarowa 2c, 43-100 Tychy
            </p>
            <p style="margin:6px 0 0;color:${MUTED_COLOR};font-size:11px;line-height:1.5;">
              Wiadomość wygenerowana automatycznie po podpisaniu dokumentu.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const phoneText = input.serviceLocationPhone
    ? ` lub pod numerem ${input.serviceLocationPhone}`
    : "";
  const text = [
    greeting,
    "",
    `W załączniku znajdziesz podpisaną kopię potwierdzenia odbioru urządzenia${
      input.ticketNumber ? ` ${input.ticketNumber}` : ""
    }.`,
    "",
    `Status zlecenia możesz śledzić na ${stripScheme(url)}${phoneText}.`,
    "",
    BRAND_NAME,
  ].join("\n");

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function digitsOnly(s: string): string {
  return s.replace(/[^\d+]/g, "");
}
