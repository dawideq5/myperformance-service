import { withClient } from "@/lib/db";

/**
 * Sticky security locks per user. Po admin enforce (CONFIGURE_TOTP /
 * webauthn-register-passwordless) zostaje wpis w tabeli — nawet gdy KC
 * usunie required action po wykonaniu setupu, lock pozostaje i blokuje
 * user-self DELETE credential. Admin DELETE actions czyści lock.
 *
 * Storage w naszej DB (nie KC user attributes), bo KC 26.6.1 z User
 * Profile schema odrzuca custom attributes które nie są zarejestrowane
 * w realm UserProfileProvider config.
 */

export type SecurityLockKind = "totp" | "webauthn";

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_user_security_locks (
        user_id  TEXT NOT NULL,
        kind     TEXT NOT NULL,
        set_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        set_by   TEXT,
        PRIMARY KEY (user_id, kind)
      );
    `);
  });
  schemaReady = true;
}

export async function setLock(
  userId: string,
  kind: SecurityLockKind,
  setBy: string | null = null,
): Promise<void> {
  await ensureSchema();
  await withClient((c) =>
    c.query(
      `INSERT INTO mp_user_security_locks (user_id, kind, set_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, kind) DO UPDATE SET set_at = now(), set_by = EXCLUDED.set_by`,
      [userId, kind, setBy],
    ),
  );
}

export async function clearLock(
  userId: string,
  kind: SecurityLockKind,
): Promise<void> {
  await ensureSchema();
  await withClient((c) =>
    c.query(
      `DELETE FROM mp_user_security_locks WHERE user_id = $1 AND kind = $2`,
      [userId, kind],
    ),
  );
}

export async function isLocked(
  userId: string,
  kind: SecurityLockKind,
): Promise<boolean> {
  await ensureSchema();
  return withClient(async (c) => {
    const r = await c.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM mp_user_security_locks
        WHERE user_id = $1 AND kind = $2`,
      [userId, kind],
    );
    return Number(r.rows[0]?.count ?? 0) > 0;
  });
}

export async function getLocksForUser(
  userId: string,
): Promise<Record<SecurityLockKind, boolean>> {
  await ensureSchema();
  const r = await withClient((c) =>
    c.query<{ kind: string }>(
      `SELECT kind FROM mp_user_security_locks WHERE user_id = $1`,
      [userId],
    ),
  );
  const out: Record<SecurityLockKind, boolean> = { totp: false, webauthn: false };
  for (const row of r.rows) {
    if (row.kind === "totp" || row.kind === "webauthn") out[row.kind] = true;
  }
  return out;
}
