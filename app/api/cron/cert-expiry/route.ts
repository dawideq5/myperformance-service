export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listCertificates } from "@/lib/persistence";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "cron-cert-expiry" });

/**
 * Codzienny cron — sprawdza certyfikaty wygasające w ciągu 14 dni i wysyła
 * `account.cert.expiring` jednorazowo per cert (deduplicated po
 * `mp_cert_expiry_notified` table).
 *
 * Auth: Bearer token z env CRON_SECRET. Uruchamiany z host-cron lub
 * Coolify scheduler (curl POST /api/cron/cert-expiry).
 *
 * 0 3 * * * curl -H "Authorization: Bearer $CRON_SECRET" -X POST https://myperformance.pl/api/cron/cert-expiry
 */

const WARN_DAYS = 14;

async function ensureNotifiedTable(): Promise<void> {
  await withClient((c) =>
    c.query(`
      CREATE TABLE IF NOT EXISTS mp_cert_expiry_notified (
        cert_id     TEXT PRIMARY KEY,
        notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        not_after   TIMESTAMPTZ NOT NULL
      );
    `),
  );
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureNotifiedTable();

  const certs = await listCertificates();
  const now = Date.now();
  const cutoff = now + WARN_DAYS * 24 * 3600 * 1000;
  const expiring = certs.filter((c) => {
    if (c.revokedAt) return false;
    const t = new Date(c.notAfter).getTime();
    return t > now && t < cutoff;
  });

  let notifiedCount = 0;
  for (const c of expiring) {
    // Deduplikacja: nie powiadamiamy ponownie jeśli już notif wyszedł i not_after się nie zmienił
    const alreadyNotified = await withClient(async (cli) => {
      const r = await cli.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM mp_cert_expiry_notified
          WHERE cert_id = $1 AND not_after = $2) AS exists`,
        [c.id, c.notAfter],
      );
      return r.rows[0]?.exists ?? false;
    });
    if (alreadyNotified) continue;

    const uid = await getUserIdByEmail(c.email);
    if (!uid) continue;

    const daysLeft = Math.ceil((new Date(c.notAfter).getTime() - now) / (24 * 3600 * 1000));
    await notifyUser(uid, "account.cert.expiring", {
      title: `Twój certyfikat klienta wygasa za ${daysLeft} dni`,
      body: `Certyfikat ${c.subject} (CN: ${c.subject}) wygasa ${new Date(c.notAfter).toLocaleDateString("pl-PL")}. Skontaktuj się z administratorem żeby wystawić nowy.`,
      severity: "warning",
      forceEmail: true,
      payload: { certId: c.id, notAfter: c.notAfter, daysLeft },
    });

    await withClient((cli) =>
      cli.query(
        `INSERT INTO mp_cert_expiry_notified (cert_id, not_after)
         VALUES ($1, $2)
         ON CONFLICT (cert_id) DO UPDATE SET
           not_after = EXCLUDED.not_after,
           notified_at = now()`,
        [c.id, c.notAfter],
      ),
    );
    notifiedCount++;
  }

  logger.info("cert expiry cron run", { checked: certs.length, expiring: expiring.length, notified: notifiedCount });
  return NextResponse.json({ ok: true, checked: certs.length, expiring: expiring.length, notified: notifiedCount });
}
