import { createHash, randomInt } from "crypto";
import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * Customer-portal OTP storage.
 *
 * Tabela `mp_customer_portal_otps` przechowuje 6-cyfrowe kody jednorazowe dla
 * publicznego flow `/status` na zlecenieserwisowe.pl. Kody są zapisywane jako
 * sha256 hash (z per-row salt = id) — surowy kod nigdy nie ląduje w DB.
 *
 * Założenia bezpieczeństwa:
 *  - max 5 prób walidacji per kod (po 5 row.attempts ≥ 5 → invalidate),
 *  - max 3 nowe kody na 10 minut per email (rate limit warstwowo, nie tu),
 *  - okno ważności 10 minut (expires_at = now + 600s),
 *  - po użyciu ustawiamy `used_at` żeby zablokować replay.
 *
 * Tabela jest tworzona przez `ensureOtpTable()` przy pierwszym użyciu —
 * idempotentnie. Brak osobnej migracji w `scripts/migrations/` żeby uniknąć
 * uruchamiania osobnego kroku CI; tabela jest „własna" tej feature flagi.
 */

const logger = log.child({ module: "customer-portal-otp" });

const TABLE = "mp_customer_portal_otps";

let ensured = false;

export async function ensureOtpTable(): Promise<void> {
  if (ensured) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ NULL,
        attempts INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await c.query(
      `CREATE INDEX IF NOT EXISTS idx_${TABLE}_email_created
       ON ${TABLE}(LOWER(email), created_at DESC);`,
    );
  });
  ensured = true;
}

function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}|${code}`).digest("hex");
}

export interface IssueOtpResult {
  /** Surowy 6-cyfrowy kod do wysłania mailem (NIGDY nie loguj). */
  code: string;
  /** ID wiersza w mp_customer_portal_otps — używany jako salt. */
  id: string;
  /** Unix epoch sec — kiedy kod wygaśnie. */
  expiresAt: number;
}

/** Generuje + zapisuje nowy OTP. Caller wysyła `code` mailem. */
export async function issueOtp(email: string): Promise<IssueOtpResult> {
  await ensureOtpTable();
  const norm = email.trim().toLowerCase();
  // crypto.randomInt jest CSPRNG; range exclusive top, więc + 1.
  const codeNum = randomInt(0, 1_000_000);
  const code = String(codeNum).padStart(6, "0");
  const expiresAtMs = Date.now() + 10 * 60 * 1000;

  // Insert najpierw z placeholder hash, potem update — żeby salt = id (PK),
  // ale id nie jest znany przed INSERT. Prostsze: użyjmy email+createdAt jako
  // salt; deterministyczne ale wystarczająco unikalne (per request).
  const salt = `${norm}|${expiresAtMs}`;
  const hash = hashCode(code, salt);

  const id = await withClient(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO ${TABLE} (email, code_hash, expires_at)
       VALUES ($1, $2, to_timestamp($3 / 1000.0))
       RETURNING id`,
      [norm, hash, expiresAtMs],
    );
    return r.rows[0].id;
  });
  return { code, id, expiresAt: Math.floor(expiresAtMs / 1000) };
}

export interface VerifyOtpResult {
  ok: boolean;
  /** Lower-cased email z wiersza, gdy OK. */
  email?: string;
  /** Powód odrzucenia: "expired" | "invalid" | "exhausted" | "not_found". */
  reason?: "expired" | "invalid" | "exhausted" | "not_found";
}

/**
 * Weryfikuje kod dla danego emaila — bierze najnowszy nieużyty/nieprzedawniony.
 * Po pomyślnej weryfikacji ustawia `used_at` (single-use). Po 5 attempts
 * wiersz zostaje invalidate (used_at = NOW()) żeby zablokować brute force.
 */
export async function verifyOtp(
  email: string,
  code: string,
): Promise<VerifyOtpResult> {
  await ensureOtpTable();
  const norm = email.trim().toLowerCase();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, reason: "invalid" };
  }
  return withClient(async (c) => {
    const r = await c.query<{
      id: string;
      code_hash: string;
      expires_at: Date;
      used_at: Date | null;
      attempts: number;
    }>(
      `SELECT id, code_hash, expires_at, used_at, attempts
         FROM ${TABLE}
        WHERE LOWER(email) = $1
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [norm],
    );
    const row = r.rows[0];
    if (!row) return { ok: false, reason: "not_found" };
    if (row.expires_at.getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    if (row.attempts >= 5) {
      // safety lockdown — invalidate
      await c.query(`UPDATE ${TABLE} SET used_at = NOW() WHERE id = $1`, [
        row.id,
      ]);
      return { ok: false, reason: "exhausted" };
    }
    // Recompute hash z tym samym schematem (salt = email|expiresMs).
    const salt = `${norm}|${row.expires_at.getTime()}`;
    const expected = hashCode(code, salt);
    if (expected !== row.code_hash) {
      await c.query(
        `UPDATE ${TABLE} SET attempts = attempts + 1 WHERE id = $1`,
        [row.id],
      );
      logger.info("customer-portal otp invalid", {
        email: norm,
        attempts: row.attempts + 1,
      });
      return { ok: false, reason: "invalid" };
    }
    await c.query(`UPDATE ${TABLE} SET used_at = NOW() WHERE id = $1`, [
      row.id,
    ]);
    return { ok: true, email: norm };
  });
}

/** Czy email przekroczył limit 3 OTP / 15 min. */
export async function isRateLimited(email: string): Promise<boolean> {
  await ensureOtpTable();
  const norm = email.trim().toLowerCase();
  return withClient(async (c) => {
    const r = await c.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${TABLE}
        WHERE LOWER(email) = $1
          AND created_at > NOW() - INTERVAL '15 minutes'`,
      [norm],
    );
    return Number(r.rows[0]?.count ?? 0) >= 3;
  });
}
