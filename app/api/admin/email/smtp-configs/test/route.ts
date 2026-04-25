export const dynamic = "force-dynamic";

import nodemailer from "nodemailer";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface TestPayload {
  /** Adres na który wysłać testowy email (wymagany). */
  to: string;
  /** Konfiguracja SMTP do przetestowania (live, nie z DB). */
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  useTls?: boolean;
  fromEmail: string;
  fromDisplay?: string | null;
  replyTo?: string | null;
}

/**
 * Testuje konfigurację SMTP — najpierw `verify()` (handshake + auth),
 * potem `sendMail()` testowej wiadomości. Zwraca szczegółowy status każdego
 * kroku, żeby admin wiedział czy problem to network, auth, czy delivery.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as TestPayload | null;
    if (!body?.to || !body?.smtpHost || !body?.fromEmail) {
      throw ApiError.badRequest("to + smtpHost + fromEmail required");
    }

    const transporter = nodemailer.createTransport({
      host: body.smtpHost,
      port: body.smtpPort || 25,
      secure: body.useTls === true,
      // Niektóre OVH/legacy serwery: trzeba zaakceptować self-signed na cert
      // chain. Domyślnie nodemailer odrzuca — zostaw strict.
      tls: { rejectUnauthorized: true },
      auth:
        body.smtpUser && body.smtpPassword
          ? { user: body.smtpUser, pass: body.smtpPassword }
          : undefined,
      // Krótszy timeout — test ma być szybki (admin czeka na wynik).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    // Step 1: verify connection + auth
    const verifyResult = await transporter
      .verify()
      .then(() => ({ ok: true as const }))
      .catch((err: Error) => ({
        ok: false as const,
        error: err.message,
        code: (err as Error & { code?: string }).code,
      }));

    if (!verifyResult.ok) {
      return createSuccessResponse({
        verified: false,
        sent: false,
        error: verifyResult.error,
        errorCode: verifyResult.code,
        hint: hintFromError(verifyResult.error, verifyResult.code),
      });
    }

    // Step 2: send actual test email
    const from = body.fromDisplay
      ? `${body.fromDisplay} <${body.fromEmail}>`
      : body.fromEmail;

    const sendResult = await transporter
      .sendMail({
        from,
        to: body.to,
        replyTo: body.replyTo ?? undefined,
        subject: "[TEST] MyPerformance email gateway",
        text: testText(body),
        html: testHtml(body),
      })
      .then((info) => ({
        ok: true as const,
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
      }))
      .catch((err: Error) => ({
        ok: false as const,
        error: err.message,
      }));

    if (!sendResult.ok) {
      return createSuccessResponse({
        verified: true,
        sent: false,
        error: sendResult.error,
        hint: "Połączenie OK, ale wysyłka nie powiodła się — sprawdź czy from i to są w domenach które serwer akceptuje.",
      });
    }

    return createSuccessResponse({
      verified: true,
      sent: true,
      messageId: sendResult.messageId,
      accepted: sendResult.accepted,
      rejected: sendResult.rejected,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function hintFromError(message: string, code?: string): string {
  const m = message.toLowerCase();
  if (code === "EAUTH" || m.includes("authentication")) {
    return "Błąd logowania. Sprawdź user (zwykle pełen email) i hasło. Dla OVH: hasło to to które ustawiłeś dla tej skrzynki w panelu OVH.";
  }
  if (code === "ETIMEDOUT" || m.includes("timeout")) {
    return "Timeout połączenia. Sprawdź: poprawny host, port (465 dla SSL/TLS, 587 dla STARTTLS, 25 dla plain), firewall, czy serwer odpowiada na ping.";
  }
  if (code === "ECONNREFUSED" || m.includes("refused")) {
    return "Połączenie odrzucone — port zamknięty lub host blokuje połączenia z naszego IP.";
  }
  if (code === "ENOTFOUND" || m.includes("getaddrinfo")) {
    return "Host nieznany. Sprawdź pisownię (np. ssl0.ovh.net dla OVH).";
  }
  if (m.includes("self signed") || m.includes("cert")) {
    return "Problem z certyfikatem TLS serwera. Dla OVH użyj ssl0.ovh.net (nie smtp.mail.ovh.net) — ten ma poprawny cert.";
  }
  return "Sprawdź logi serwera SMTP (zwykle: panel administracyjny dostawcy → email logs).";
}

function testText(p: TestPayload): string {
  return `Test SMTP gateway — MyPerformance Dashboard

Konfiguracja:
- Host: ${p.smtpHost}
- Port: ${p.smtpPort}
- TLS: ${p.useTls ? "tak (SSL/TLS)" : "nie (plain lub STARTTLS)"}
- User: ${p.smtpUser || "(brak auth)"}
- From: ${p.fromEmail}

Jeśli ta wiadomość dotarła — konfiguracja działa.
`;
}

function testHtml(p: TestPayload): string {
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;padding:24px;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
  <h2 style="margin:0 0 16px;color:#0c0c0e">✓ Test SMTP gateway</h2>
  <p style="color:#444;margin:0 0 16px">Wiadomość testowa wysłana z dashboardu MyPerformance.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;color:#444">
    <tr><td style="padding:6px 0;color:#888;width:120px">Host</td><td style="padding:6px 0;font-family:monospace">${p.smtpHost}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Port</td><td style="padding:6px 0;font-family:monospace">${p.smtpPort}</td></tr>
    <tr><td style="padding:6px 0;color:#888">TLS</td><td style="padding:6px 0">${p.useTls ? "SSL/TLS (port 465)" : "plain / STARTTLS"}</td></tr>
    <tr><td style="padding:6px 0;color:#888">User</td><td style="padding:6px 0;font-family:monospace">${p.smtpUser || "(brak auth)"}</td></tr>
    <tr><td style="padding:6px 0;color:#888">From</td><td style="padding:6px 0;font-family:monospace">${p.fromEmail}</td></tr>
  </table>
  <p style="margin:24px 0 0;color:#888;font-size:12px">Jeśli ta wiadomość dotarła — konfiguracja działa i można jej używać dla rzeczywistych szablonów.</p>
</div>
</body></html>`;
}
