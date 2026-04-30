import nodemailer, { type Transporter } from "nodemailer";
import SMTPPool from "nodemailer/lib/smtp-pool";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env";

let cachedTransporter: Transporter | null = null;
let cachedConfirmationTransporter: Transporter | null = null;

function buildTransporter(prefix = "SMTP"): Transporter {
  const host = getRequiredEnv(`${prefix}_HOST`);
  const port = Number(getOptionalEnv(`${prefix}_PORT`, "465"));
  const secure = getOptionalEnv(`${prefix}_SECURE`, "true") !== "false";
  const user = getRequiredEnv(`${prefix}_USER`);
  const pass = getRequiredEnv(`${prefix}_PASSWORD`);
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
  if (!cachedTransporter) cachedTransporter = buildTransporter("SMTP");
  return cachedTransporter;
}

/** Drugi transporter dla maili wysyłanych w imieniu Caseownia
 * (zlecenieserwisowe.pl). Domyślnie reuses SMTP env z innym
 * USER/PASSWORD; gdy CONFIRMATION_SMTP_PASSWORD nieustawione, fallback
 * na główny transporter (mail może być wtedy odrzucony przez Postal). */
function getConfirmationTransporter(): Transporter {
  if (cachedConfirmationTransporter) return cachedConfirmationTransporter;
  const hasOverride =
    getOptionalEnv("CONFIRMATION_SMTP_PASSWORD").trim().length > 0;
  if (!hasOverride) {
    cachedConfirmationTransporter = getTransporter();
    return cachedConfirmationTransporter;
  }
  const host = getOptionalEnv("CONFIRMATION_SMTP_HOST").trim() ||
    getRequiredEnv("SMTP_HOST");
  const port = Number(
    getOptionalEnv("CONFIRMATION_SMTP_PORT").trim() ||
      getOptionalEnv("SMTP_PORT", "465"),
  );
  const secure =
    (getOptionalEnv("CONFIRMATION_SMTP_SECURE").trim() ||
      getOptionalEnv("SMTP_SECURE", "true")) !== "false";
  const user = getOptionalEnv("CONFIRMATION_SMTP_USER").trim() || "main";
  const pass = getRequiredEnv("CONFIRMATION_SMTP_PASSWORD");
  cachedConfirmationTransporter = nodemailer.createTransport({
    pool: true,
    host,
    port,
    secure,
    auth: { user, pass },
    maxConnections: 1,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  } satisfies SMTPPool.Options);
  return cachedConfirmationTransporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Override sender. Default = CERT_EMAIL_FROM_* env vars. */
  fromName?: string;
  fromAddress?: string;
  replyTo?: string;
  /** Wybierz transporter: "default" (SMTP_*) lub "confirmation"
   * (CONFIRMATION_SMTP_*). Confirmation = osobny credential Postal dla
   * domeny zlecenieserwisowe.pl (Caseownia). */
  transport?: "default" | "confirmation";
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}

function sanitizeDisplayName(name: string): string {
  // Postal w niektórych konfiguracjach zwraca "530 From/Sender name not
  // valid" gdy display name zawiera znaki spoza ASCII. Strip non-ASCII —
  // bezpieczne ASCII-only display name (klient widzi w From: header).
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

export async function sendMail(input: SendMailInput): Promise<{ messageId: string }> {
  const fromName =
    input.fromName ?? getOptionalEnv("CERT_EMAIL_FROM_NAME", "MyPerformance");
  const fromAddr =
    input.fromAddress ??
    getOptionalEnv("CERT_EMAIL_FROM_ADDRESS", "noreply@myperformance.pl");
  const transporter =
    input.transport === "confirmation"
      ? getConfirmationTransporter()
      : getTransporter();
  const safeName = sanitizeDisplayName(fromName);
  const info = await transporter.sendMail({
    from: safeName ? `"${safeName}" <${fromAddr}>` : fromAddr,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    attachments: input.attachments,
  });
  return { messageId: info.messageId };
}
