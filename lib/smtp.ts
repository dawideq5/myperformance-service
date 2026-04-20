import nodemailer, { type Transporter } from "nodemailer";
import SMTPPool from "nodemailer/lib/smtp-pool";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env";

let cachedTransporter: Transporter | null = null;

function buildTransporter(): Transporter {
  const host = getRequiredEnv("SMTP_HOST");
  const port = Number(getOptionalEnv("SMTP_PORT", "465"));
  const secure = getOptionalEnv("SMTP_SECURE", "true") !== "false";
  const user = getRequiredEnv("SMTP_USER");
  const pass = getRequiredEnv("SMTP_PASSWORD");
  const options: SMTPPool.Options = {
    pool: true,
    host,
    port,
    secure,
    auth: { user, pass },
    maxConnections: 1,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  };
  return nodemailer.createTransport(options);
}

function getTransporter(): Transporter {
  if (!cachedTransporter) cachedTransporter = buildTransporter();
  return cachedTransporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}

export async function sendMail(input: SendMailInput): Promise<{ messageId: string }> {
  const fromName = getOptionalEnv("CERT_EMAIL_FROM_NAME", "MyPerformance");
  const fromAddr = getOptionalEnv("CERT_EMAIL_FROM_ADDRESS", "noreply@myperformance.pl");
  const info = await getTransporter().sendMail({
    from: `"${fromName}" <${fromAddr}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: input.attachments,
  });
  return { messageId: info.messageId };
}
