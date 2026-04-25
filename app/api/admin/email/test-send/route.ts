export const dynamic = "force-dynamic";

import nodemailer from "nodemailer";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getOptionalEnv } from "@/lib/env";
import { getBranding } from "@/lib/email/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

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
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as Payload | null;
    if (!body?.to) throw ApiError.badRequest("to required");

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
