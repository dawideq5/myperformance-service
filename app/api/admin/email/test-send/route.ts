export const dynamic = "force-dynamic";

import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { getOptionalEnv } from "@/lib/env";
import { getBranding } from "@/lib/email/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

const logger = log.child({ module: "admin-test-send" });

interface Payload {
  to: string;
  subject?: string;
  body?: string;
}

/**
 * Wysyła testowy email przez SMTP gateway (Postal). Konfiguracja z env:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD (już istnieją w dashboard
 * Coolify config bo cert-delivery emails używają tego samego transportu).
 *
 * Body jest substutuowane prostym replace dla zmiennych: {{brandName}},
 * {{supportEmail}}, {{recipient}} (variable interpolation MVP).
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);

    // Rate-limit: nawet zaufany admin nie powinien móc spamować mailbox.
    // 10/5min per (admin, IP) — wystarczy do testów branding/template,
    // a ucina abuse jeśli admin account zostanie skompromitowany.
    const adminId = session.user?.id ?? session.user?.email ?? "unknown";
    const ip = getClientIp(req);
    const limit = rateLimit(`admin:test-send:${adminId}:${ip}`, {
      capacity: 10,
      refillPerSec: 10 / 300,
    });
    if (!limit.allowed) {
      logger.warn("admin test-send rate-limited", { adminId, ip });
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Zbyt wiele test-send — odczekaj chwilę.",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        },
      );
    }

    const body = (await req.json().catch(() => null)) as Payload | null;
    if (!body?.to) throw ApiError.badRequest("to required");
    // Walidacja recipient: bardzo prosta — bez tego admin mógłby wysłać do
    // dowolnego adresu, co przy XSS w admin panel byłoby vector. Akceptujemy
    // tylko valid email format.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to) || body.to.length > 254) {
      throw ApiError.badRequest("Nieprawidłowy adres email odbiorcy");
    }

    const host = getOptionalEnv("SMTP_HOST");
    const port = Number(getOptionalEnv("SMTP_PORT") || "25");
    const user = getOptionalEnv("SMTP_USER");
    const password = getOptionalEnv("SMTP_PASSWORD");
    if (!host) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "SMTP_HOST not configured",
        503,
      );
    }

    const branding = await getBranding();
    const from = branding.fromDisplay
      ? `${branding.fromDisplay} <${branding.replyTo ?? "noreply@myperformance.pl"}>`
      : `${branding.brandName} <${branding.replyTo ?? "noreply@myperformance.pl"}>`;

    const subject = body.subject ?? `[Test] ${branding.brandName} email gateway`;
    const rawBody =
      body.body ??
      `To jest testowa wiadomość z panelu admina dashboardu MyPerformance.\n\nMarka: {{brandName}}\nSupport: {{supportEmail}}\nOdbiorca: {{recipient}}\nWysłane przez: {{actor}}\n`;
    const rendered = rawBody
      .replaceAll("{{brandName}}", branding.brandName)
      .replaceAll("{{supportEmail}}", branding.supportEmail ?? "")
      .replaceAll("{{recipient}}", body.to)
      .replaceAll("{{actor}}", session.user?.email ?? "admin");

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: user && password ? { user, pass: password } : undefined,
    });

    const info = await transporter.sendMail({
      from,
      to: body.to,
      replyTo: branding.replyTo ?? undefined,
      subject,
      text: rendered,
      html: `<pre style="font-family:monospace;white-space:pre-wrap">${rendered.replace(/[<>]/g, "")}</pre>`,
    });

    return createSuccessResponse({
      ok: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
