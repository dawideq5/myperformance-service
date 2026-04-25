import { log } from "@/lib/logger";
import {
  blockIp,
  countRecentEvents,
  recordEvent,
} from "./db";

const logger = log.child({ module: "brute-force-detection" });

const THRESHOLD_FAILS = 5;
const WINDOW_MINUTES = 5;
const BLOCK_DURATION_MINUTES = 60;

/**
 * Wywołane po każdym KC LOGIN_ERROR event. Sprawdza count z ostatnich
 * 5 min — jeśli ≥5, automatycznie blokuje IP na 60 min + zapisuje
 * security event severity=critical + wysyła alert email.
 */
export async function checkBruteForce(args: {
  srcIp: string;
  targetUser?: string;
}): Promise<{ blocked: boolean; count: number }> {
  if (!args.srcIp) return { blocked: false, count: 0 };

  try {
    const count = await countRecentEvents({
      srcIp: args.srcIp,
      category: "keycloak.login_error",
      windowMinutes: WINDOW_MINUTES,
    });

    if (count < THRESHOLD_FAILS) {
      return { blocked: false, count };
    }

    // Threshold przekroczony → block + audit + email alert
    await blockIp({
      ip: args.srcIp,
      reason: `Brute force: ${count} failed login w ${WINDOW_MINUTES} min`,
      blockedBy: "auto-detection",
      source: "brute-force-detector",
      durationMinutes: BLOCK_DURATION_MINUTES,
      attempts: count,
      details: { detector: "kc_login_error", windowMinutes: WINDOW_MINUTES },
    });

    await recordEvent({
      severity: "critical",
      category: "auto.brute_force_block",
      source: "brute-force-detector",
      title: `IP ${args.srcIp} zablokowane — brute force (${count} failed login)`,
      description: `Wykryto ${count} nieudanych prób logowania z tego IP w ${WINDOW_MINUTES} min. IP zablokowane automatycznie na ${BLOCK_DURATION_MINUTES} min. Możesz odblokować w panelu /admin/security → Zablokowane IP.`,
      srcIp: args.srcIp,
      targetUser: args.targetUser,
      details: {
        threshold: THRESHOLD_FAILS,
        windowMinutes: WINDOW_MINUTES,
        blockDurationMinutes: BLOCK_DURATION_MINUTES,
        actualCount: count,
      },
    });

    // Email alert (best-effort, nie blokuje detekcji)
    void sendBruteForceAlertEmail({
      ip: args.srcIp,
      count,
      targetUser: args.targetUser,
    }).catch((err) => {
      logger.warn("brute force email alert failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    logger.warn("brute force detected, IP blocked", {
      ip: args.srcIp,
      count,
      durationMin: BLOCK_DURATION_MINUTES,
    });

    return { blocked: true, count };
  } catch (err) {
    logger.error("brute force check failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return { blocked: false, count: 0 };
  }
}

async function sendBruteForceAlertEmail(args: {
  ip: string;
  count: number;
  targetUser?: string;
}): Promise<void> {
  const nodemailer = await import("nodemailer");
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 25);
  if (!host) return;

  const transporter = nodemailer.default.createTransport({
    host,
    port,
    secure: false,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
  });

  const recipient = process.env.SECURITY_NOTIFY_TO ?? "dawidtychy5@gmail.com";
  const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#333">
<div style="padding:40px 20px">
<table style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05)" align="center" role="presentation">
<tr><td style="background:#0c0c0e;padding:35px 20px;text-align:center"><p style="color:#fff;font-size:32px;font-weight:800;margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">MyPerformance</p></td></tr>
<tr><td style="padding:40px 30px;line-height:1.6;font-size:15px">
<h1 style="font-size:22px;color:#dc2626;margin:0 0 20px">⚠ Wykryto brute force</h1>
<p style="color:#444;margin:0 0 20px">System bezpieczeństwa zablokował IP po wykryciu nadmiernych prób logowania.</p>
<table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
<tr><td style="padding:8px 0;color:#888;width:140px">IP</td><td style="padding:8px 0;font-family:monospace;color:#dc2626">${args.ip}</td></tr>
<tr><td style="padding:8px 0;color:#888">Próby logowania</td><td style="padding:8px 0"><strong>${args.count}</strong> w ostatnich ${WINDOW_MINUTES} min</td></tr>
${args.targetUser ? `<tr><td style="padding:8px 0;color:#888">Atakowane konto</td><td style="padding:8px 0;font-family:monospace">${args.targetUser}</td></tr>` : ""}
<tr><td style="padding:8px 0;color:#888">Akcja</td><td style="padding:8px 0">Auto-blokada na <strong>${BLOCK_DURATION_MINUTES} minut</strong></td></tr>
</table>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:18px 0;color:#7f1d1d;font-size:13px">
<strong>To może być atak!</strong> Sprawdź szczegóły w panelu /admin/security i podejmij ewentualne działania.
</div>
<div class="button-container" style="text-align:center;margin:32px 0 8px 0;">
<a href="https://myperformance.pl/admin/security" style="display:inline-block;padding:14px 28px;background-color:#0c0c0e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Otwórz panel bezpieczeństwa</a>
</div>
<p style="color:#666;font-size:12px;margin-top:24px">IP automatycznie się odblokuje po ${BLOCK_DURATION_MINUTES} minutach. W panelu możesz zablokować na dłużej (24h/7d/permanent) albo natychmiast odblokować.</p>
</td></tr>
<tr><td style="background:#fafafa;padding:24px 30px;text-align:center;font-size:12px;color:#666;border-top:1px solid #eee">
Automatyczny alert security · ${new Date().toLocaleString("pl-PL")}
</td></tr>
</table>
</div></body></html>`;

  await transporter.sendMail({
    from: "MyPerformance Security <noreply@myperformance.pl>",
    to: recipient,
    subject: `🚨 Brute force zablokowany — ${args.ip} (${args.count}× failed login)`,
    text: `Brute force detected from ${args.ip}: ${args.count} failed login attempts in ${WINDOW_MINUTES} minutes. Auto-blocked for ${BLOCK_DURATION_MINUTES} minutes. Check /admin/security.`,
    html,
  });
}
