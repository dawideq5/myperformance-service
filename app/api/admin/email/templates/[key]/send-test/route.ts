export const dynamic = "force-dynamic";

import nodemailer from "nodemailer";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import {
  renderTemplate,
  exampleContextForAction,
} from "@/lib/email/render";
import {
  getDefaultSmtpConfig,
  getSmtpConfig,
} from "@/lib/email/db";
import { actionByKey } from "@/lib/email/templates-catalog";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ key: string }>;
}

interface SendTestPayload {
  to: string;
  draftSubject?: string;
  draftBody?: string;
  layoutId?: string | null;
  smtpConfigId?: string | null;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { key } = await params;
    const action = actionByKey(key);
    if (!action) throw ApiError.notFound("Unknown action key");

    const body = (await req.json().catch(() => null)) as SendTestPayload | null;
    if (!body?.to) throw ApiError.badRequest("to required");

    const result = await renderTemplate(key, {
      draftSubject: body.draftSubject,
      draftBody: body.draftBody,
      layoutId: body.layoutId,
      context: exampleContextForAction(key),
    });
    if (!result) throw ApiError.notFound("Render failed");

    const smtp = body.smtpConfigId
      ? await getSmtpConfig(body.smtpConfigId)
      : await getDefaultSmtpConfig();
    if (!smtp) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Brak skonfigurowanego SMTP",
        503,
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtp.smtpHost,
      port: smtp.smtpPort,
      secure: smtp.useTls,
      auth:
        smtp.smtpUser && smtp.smtpPassword
          ? { user: smtp.smtpUser, pass: smtp.smtpPassword }
          : undefined,
    });

    const from = smtp.fromDisplay
      ? `${smtp.fromDisplay} <${smtp.fromEmail}>`
      : smtp.fromEmail;

    const info = await transporter.sendMail({
      from,
      to: body.to,
      replyTo: smtp.replyTo ?? undefined,
      subject: `[TEST] ${result.subject}`,
      text: result.text,
      html: result.html,
    });

    return createSuccessResponse({
      ok: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      smtpAlias: smtp.alias,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
