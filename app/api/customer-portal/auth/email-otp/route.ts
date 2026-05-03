import { NextResponse } from "next/server";
import { issueOtp, isRateLimited } from "@/lib/customer-portal/otp";
import { corsHeaders, preflightResponse } from "@/lib/customer-portal/cors";
import { sendMail } from "@/lib/smtp";
import { renderTemplate } from "@/lib/email/render";
import { log } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const logger = log.child({ module: "customer-portal-email-otp" });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function OPTIONS(req: Request) {
  return preflightResponse(req);
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: cors },
    );
  }
  const email = String((body as { email?: unknown })?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "invalid_email" },
      { status: 400, headers: cors },
    );
  }

  // Per-IP rate limit: 6 OTP requests / minute (token-bucket). Niezależny od
  // per-email DB throttle — zatrzymuje botnet przed nawet napisaniem do DB.
  const ip = getClientIp(req);
  const limit = rateLimit(`customer-portal-otp:${ip}`, {
    capacity: 6,
    refillPerSec: 0.1,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "too_many_requests", retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: cors },
    );
  }

  // Per-email throttle: 3 OTP / 15 min.
  if (await isRateLimited(email)) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: cors },
    );
  }

  let issued: { code: string; expiresAt: number };
  try {
    issued = await issueOtp(email);
  } catch (err) {
    logger.error("issueOtp failed", { err: String(err) });
    return NextResponse.json(
      { error: "internal" },
      { status: 500, headers: cors },
    );
  }

  // Render email — szablon `customer_portal_otp` (z catalog) ma fallback do
  // hardcoded body gdy DB-only template missing. Body markdown:
  const subject = "Kod do sprawdzenia statusu zlecenia";
  const bodyMd = [
    `Twój 6-cyfrowy kod do sprawdzenia statusu naprawy:`,
    "",
    `## ${issued.code}`,
    "",
    "Kod jest ważny przez 10 minut. Jeżeli nie prosiłeś o ten kod, zignoruj wiadomość.",
    "",
    "Caseownia — Serwis telefonów",
  ].join("\n");

  let html: string | null = null;
  try {
    const rendered = await renderTemplate("customer_portal_otp", {
      draftSubject: subject,
      draftBody: bodyMd,
      // Wave 21 Faza 1F: jawny layout slug zamiast default — żeby wszystkie
      // emaile do klienta serwisu trafiały w layoucie Caseownia (białe tło,
      // logo "Serwis telefonów by Caseownia"), nie myperformance.
      layoutSlug: "zlecenieserwisowe",
      context: {
        otp: issued.code,
        brand: {
          name: "Serwis telefonów by Caseownia",
          url: "https://zlecenieserwisowe.pl",
          logoUrl: "https://zlecenieserwisowe.pl/logo-serwis.png",
          supportEmail: "caseownia@zlecenieserwisowe.pl",
          legalName: "UNIKOM S.C.",
        },
      },
    });
    html = rendered?.html ?? null;
  } catch (err) {
    logger.warn("renderTemplate failed, falling back to plain html", {
      err: String(err),
    });
  }

  // Plain HTML fallback gdy template-render nie dostępne (np. DB layout puste).
  // Light theme spójny z layoutem zlecenieserwisowe — bez czarnego headera.
  const fallbackHtml = `<!doctype html><html lang="pl"><body style="font-family:Inter,Arial,sans-serif;background:#f5f5f5;padding:32px;color:#1a1a1a;margin:0;">
    <table style="max-width:600px;margin:auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#fff;border-bottom:1px solid #e0e0e0;padding:20px 24px;text-align:center;font-weight:600;color:#1a1a1a;">Serwis telefonów by Caseownia</td></tr>
      <tr><td style="padding:32px 24px;">
        <p style="margin:0 0 16px;">Twój 6-cyfrowy kod do sprawdzenia statusu naprawy:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;background:#fafafa;padding:18px;border-radius:8px;border:1px solid #e0e0e0;color:#0a0a0a;">${issued.code}</p>
        <p style="color:#666;font-size:13px;margin-top:18px;">Kod jest ważny przez 10 minut. Jeśli nie prosiłeś o ten kod — zignoruj wiadomość.</p>
      </td></tr>
      <tr><td style="background:#fafafa;border-top:1px solid #e0e0e0;padding:16px 24px;text-align:center;font-size:12px;color:#666;">Wiadomość od caseownia@zlecenieserwisowe.pl</td></tr>
    </table>
  </body></html>`;

  try {
    // Wave 22 / F1: customer-portal authentication — bez serviceId nie da
    // się rozsądzić brandu. Zostaje `zlecenieserwisowe` (tylko klienci serwisu
    // korzystają z customer-portal). Follow-up: wprowadzić brand context
    // przez subpath (`/serwisowe/auth` vs `/myperformance/auth`) gdy
    // myperformance dorobi własny customer-portal flow.
    await sendMail({
      to: email,
      subject,
      html: html ?? fallbackHtml,
      text: `Twój kod: ${issued.code} (ważny 10 minut).`,
      profileSlug: "zlecenieserwisowe",
    });
  } catch (err) {
    logger.error("customer-portal otp send failed", {
      err: String(err),
      email,
    });
    // Nie ujawniamy szczegółów na zewnątrz — UX: kod „został wysłany".
  }

  return NextResponse.json(
    { ok: true, expiresIn: 600 },
    { status: 200, headers: cors },
  );
}
