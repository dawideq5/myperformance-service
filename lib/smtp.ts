import nodemailer, { type Transporter } from "nodemailer";
import SMTPPool from "nodemailer/lib/smtp-pool";
import { getOptionalEnv } from "@/lib/env";
import {
  getDefaultSmtpProfile,
  getSmtpProfile,
  type SmtpProfile,
} from "@/lib/email/db/smtp-profiles";
import { log } from "@/lib/logger";

/**
 * SMTP wysyłka — resolver oparty na `mp_email_smtp_profiles`.
 *
 * Wybór profilu (priorytet):
 *   1. `input.profileSlug` — explicit override
 *   2. `input.transport === "confirmation"` → "zlecenieserwisowe" (legacy
 *      kompatybilność dla starych callsite'ów: cert-delivery + Documenso
 *      webhook)
 *   3. `branding.defaultSmtpProfileSlug` jeśli ustawione w `mp_branding`
 *   4. `getDefaultSmtpProfile()` (is_default = TRUE w DB)
 *
 * Hasło: `passwordRef` → `process.env[ref]` (preferred); fallback
 * `passwordPlain`. Brak → throw.
 *
 * Cache transporterów per slug. `invalidateTransporterCache(slug?)` po
 * upsert / delete profilu.
 */

const transporterCache = new Map<string, Transporter>();
const logger = log.child({ module: "smtp" });

function buildTransporter(profile: SmtpProfile, password: string): Transporter {
  const options: SMTPPool.Options = {
    pool: true,
    host: profile.host,
    port: profile.port,
    secure: profile.secure,
    auth: { user: profile.username, pass: password },
    maxConnections: 1,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  };
  return nodemailer.createTransport(options);
}

function resolvePassword(profile: SmtpProfile): string {
  if (profile.passwordRef) {
    const fromEnv = getOptionalEnv(profile.passwordRef).trim();
    if (fromEnv.length > 0) return fromEnv;
  }
  if (profile.passwordPlain && profile.passwordPlain.length > 0) {
    return profile.passwordPlain;
  }
  throw new Error(
    `SMTP password not configured for profile "${profile.slug}" — ustaw env ${
      profile.passwordRef ?? "(passwordRef pusty)"
    } lub wpisz hasło ręcznie w panelu admina.`,
  );
}

function getOrBuildTransporter(profile: SmtpProfile): Transporter {
  const cached = transporterCache.get(profile.slug);
  if (cached) return cached;
  const password = resolvePassword(profile);
  const t = buildTransporter(profile, password);
  transporterCache.set(profile.slug, t);
  return t;
}

/** Czyści cache transporterów (po upsert/delete profilu).
 * Wywołanie bez argumentu czyści wszystkie. */
export function invalidateTransporterCache(slug?: string): void {
  if (slug) {
    const t = transporterCache.get(slug);
    if (t) {
      try {
        t.close();
      } catch {
        // pool already closed
      }
      transporterCache.delete(slug);
    }
    return;
  }
  for (const [, t] of transporterCache) {
    try {
      t.close();
    } catch {
      // pool already closed
    }
  }
  transporterCache.clear();
}

async function resolveProfile(
  profileSlug: string | undefined,
  transport: "default" | "confirmation" | undefined,
): Promise<SmtpProfile> {
  // 1. explicit slug
  if (profileSlug) {
    const p = await getSmtpProfile(profileSlug);
    if (!p) {
      throw new Error(`SMTP profile not found: "${profileSlug}"`);
    }
    return p;
  }
  // 2. legacy transport: "confirmation" → zlecenieserwisowe
  if (transport === "confirmation") {
    const p = await getSmtpProfile("zlecenieserwisowe");
    if (p) return p;
    // fallthrough — gdyby ktoś usunął preseed, użyj default
    logger.warn("smtp.confirmation_profile_missing_fallback_default");
  }
  // 3. branding default (best-effort — nie blokuj wysyłki gdy DB read failuje)
  try {
    const { getBranding } = await import("@/lib/email/db/branding");
    const branding = await getBranding();
    if (branding.defaultSmtpProfileSlug) {
      const p = await getSmtpProfile(branding.defaultSmtpProfileSlug);
      if (p) return p;
      logger.warn("smtp.branding_default_profile_missing", {
        slug: branding.defaultSmtpProfileSlug,
      });
    }
  } catch (err) {
    logger.warn("smtp.branding_lookup_failed", { err });
  }
  // 4. global default
  const def = await getDefaultSmtpProfile();
  if (!def) {
    throw new Error(
      "No default SMTP profile configured. Wstaw profil z is_default = TRUE w mp_email_smtp_profiles.",
    );
  }
  return def;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Override sender (display + address). Default = z profilu SMTP. */
  fromName?: string;
  fromAddress?: string;
  replyTo?: string;
  /**
   * Wybór profilu SMTP po slug (`mp_email_smtp_profiles.slug`).
   * Pomija branding default + global default.
   */
  profileSlug?: string;
  /**
   * @deprecated Stary parametr. Mapowanie:
   *   "confirmation" → profileSlug "zlecenieserwisowe"
   *   "default" / undefined → branding.defaultSmtpProfileSlug || getDefaultSmtpProfile()
   * Zachowane wyłącznie dla wstecznej kompatybilności (cert-delivery + Documenso webhook).
   */
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

export async function sendMail(
  input: SendMailInput,
): Promise<{ messageId: string }> {
  const profile = await resolveProfile(input.profileSlug, input.transport);
  const transporter = getOrBuildTransporter(profile);

  const fromName = input.fromName ?? profile.fromName;
  const fromAddr = input.fromAddress ?? profile.fromAddress;
  const replyTo = input.replyTo ?? profile.replyTo ?? undefined;

  const safeName = sanitizeDisplayName(fromName);
  const info = await transporter.sendMail({
    from: safeName ? `"${safeName}" <${fromAddr}>` : fromAddr,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo,
    attachments: input.attachments,
  });
  return { messageId: info.messageId };
}
