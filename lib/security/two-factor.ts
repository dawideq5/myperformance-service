import { createHash, randomInt } from "crypto";
import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "two-factor" });

const CODE_LENGTH = 6;
const TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  // 6-cyfrowy kod, leading zeros zachowane
  return String(randomInt(0, 1_000_000)).padStart(CODE_LENGTH, "0");
}

export interface TwoFactorRequest {
  codeId: number;
  email: string;
  expiresAt: string;
}

/**
 * Generuje 6-cyfrowy kod, zapisuje hash w DB, wysyła email z kodem.
 * Zwraca codeId — używany później przy verify.
 */
export async function requestCode(args: {
  userId: string;
  email: string;
  purpose: string; // np. "login", "sensitive_action"
  srcIp?: string;
}): Promise<TwoFactorRequest> {
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  const result = await withClient(async (c) => {
    // Inwaliduj poprzednie nieaktywne kody dla tego user_id+purpose
    await c.query(
      `UPDATE mp_2fa_codes SET used_at = now()
        WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
      [args.userId, args.purpose],
    );
    const res = await c.query<{ id: number }>(
      `INSERT INTO mp_2fa_codes (user_id, email, code_hash, purpose, expires_at, src_ip)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [args.userId, args.email, codeHash, args.purpose, expiresAt, args.srcIp ?? null],
    );
    return res.rows[0];
  });

  // Wyślij email
  await sendCodeEmail({
    code,
    email: args.email,
    purpose: args.purpose,
    expiresInMinutes: TTL_MINUTES,
    srcIp: args.srcIp,
  });

  logger.info("2FA code sent", { userId: args.userId, purpose: args.purpose });

  return {
    codeId: result.id,
    email: args.email,
    expiresAt: expiresAt.toISOString(),
  };
}

export type VerifyResult =
  | { ok: true; userId: string; purpose: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" | "not_found" };

export async function verifyCode(args: {
  codeId: number;
  code: string;
}): Promise<VerifyResult> {
  return withClient(async (c) => {
    const res = await c.query<{
      user_id: string;
      purpose: string;
      code_hash: string;
      expires_at: Date;
      used_at: Date | null;
      attempts: number;
    }>(
      `SELECT user_id, purpose, code_hash, expires_at, used_at, attempts
         FROM mp_2fa_codes WHERE id = $1`,
      [args.codeId],
    );
    const row = res.rows[0];
    if (!row) return { ok: false, reason: "not_found" };
    if (row.used_at) return { ok: false, reason: "invalid" };
    if (row.expires_at.getTime() < Date.now()) return { ok: false, reason: "expired" };
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

    const expectedHash = hashCode(args.code);
    if (expectedHash !== row.code_hash) {
      await c.query(`UPDATE mp_2fa_codes SET attempts = attempts + 1 WHERE id = $1`, [args.codeId]);
      return { ok: false, reason: "invalid" };
    }
    // Mark used
    await c.query(`UPDATE mp_2fa_codes SET used_at = now() WHERE id = $1`, [args.codeId]);
    return { ok: true, userId: row.user_id, purpose: row.purpose };
  });
}

async function sendCodeEmail(args: {
  code: string;
  email: string;
  purpose: string;
  expiresInMinutes: number;
  srcIp?: string;
}): Promise<void> {
  const nodemailer = await import("nodemailer");
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 25);
  if (!host) throw new Error("SMTP_HOST not configured");

  const transporter = nodemailer.default.createTransport({
    host,
    port,
    secure: false,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
  });

  const purposeLabel: Record<string, string> = {
    login: "logowania",
    sensitive_action: "wykonania akcji administracyjnej",
    password_change: "zmiany hasła",
    email_change: "zmiany adresu email",
  };
  const lbl = purposeLabel[args.purpose] ?? args.purpose;

  const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#333">
<div style="padding:40px 20px">
<table style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05)" align="center" role="presentation">
<tr><td style="background:#0c0c0e;padding:35px 20px;text-align:center"><p style="color:#fff;font-size:32px;font-weight:800;margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">MyPerformance</p></td></tr>
<tr><td style="padding:40px 30px;line-height:1.6;font-size:15px">
<h1 style="font-size:22px;color:#111;margin:0 0 12px">Kod weryfikacyjny</h1>
<p style="color:#444;margin:0 0 20px">Twój jednorazowy kod do ${lbl}:</p>
<div style="text-align:center;margin:32px 0">
<div style="display:inline-block;font-family:'SF Mono',Monaco,monospace;font-size:42px;font-weight:bold;letter-spacing:8px;color:#0c0c0e;padding:20px 32px;background:#f4f4f5;border-radius:8px;border:2px solid #e5e7eb">
${args.code}
</div>
</div>
<p style="color:#666;font-size:13px;margin:20px 0;text-align:center">Kod jest ważny przez <strong>${args.expiresInMinutes} minut</strong>. Po tym czasie wygaśnie i będziesz musiał wygenerować nowy.</p>
${args.srcIp ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:12px;color:#92400e;margin-top:24px"><strong>Skąd to żądanie:</strong> IP ${args.srcIp}<br/>Jeśli to nie Ty próbowałeś — zignoruj ten email i zmień hasło.</div>` : ""}
<p style="color:#666;font-size:12px;margin-top:24px">Pracownicy MyPerformance <strong>nigdy</strong> nie poproszą Cię o ten kod telefonicznie ani przez wiadomość. Nie udostępniaj go nikomu.</p>
</td></tr>
<tr><td style="background:#fafafa;padding:24px 30px;text-align:center;font-size:12px;color:#666;border-top:1px solid #eee">
Jednorazowy kod weryfikacyjny · ${new Date().toLocaleString("pl-PL")}
</td></tr>
</table>
</div></body></html>`;

  await transporter.sendMail({
    from: "MyPerformance Security <noreply@myperformance.pl>",
    to: args.email,
    subject: `Kod weryfikacyjny ${args.code} — ${lbl}`,
    text: `Twój kod ${lbl}: ${args.code}\nWażny ${args.expiresInMinutes} minut.\n\nJeśli to nie Ty — zignoruj.`,
    html,
  });
}

/**
 * Cleanup wygasłych kodów. Wywoływane okresowo przez cron lub
 * przy każdym requestCode (lazy).
 */
export async function cleanupExpired(): Promise<number> {
  return withClient(async (c) => {
    const res = await c.query(
      `DELETE FROM mp_2fa_codes WHERE expires_at < now() - interval '1 day'`,
    );
    return res.rowCount ?? 0;
  });
}
