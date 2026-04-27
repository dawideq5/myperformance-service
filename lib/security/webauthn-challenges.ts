import { withClient } from "@/lib/db";

/**
 * Persistent challenge store dla WebAuthn registration. Wcześniej challenge
 * był generowany w `get-options` i zwracany do klienta, ale NIE zapisywany
 * server-side. Klient mógł zatem wysłać dowolny `clientDataJSON.challenge`
 * przy `register` — brak walidacji = potencjalny replay.
 *
 * Schema:
 *   - id PK = challenge (base64url) — unikalny per żądanie
 *   - user_id (KC sub) — challenge przypisany do konkretnego usera
 *   - purpose — `register-platform` / `register-cross-platform` / `assertion`
 *   - expires_at — TTL 60s (w spec WebAuthn challenge musi być świeży)
 *   - consumed_at — timestamp gdy challenge zostal użyty (single-use)
 */

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_webauthn_challenges (
        challenge TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await c.query(
      `CREATE INDEX IF NOT EXISTS mp_webauthn_challenges_user_idx
         ON mp_webauthn_challenges (user_id, purpose);`,
    );
    await c.query(
      `CREATE INDEX IF NOT EXISTS mp_webauthn_challenges_expires_idx
         ON mp_webauthn_challenges (expires_at);`,
    );
  });
  schemaReady = true;
}

export async function storeChallenge(args: {
  challenge: string;
  userId: string;
  purpose: string;
  ttlSeconds?: number;
}): Promise<void> {
  await ensureSchema();
  const ttl = args.ttlSeconds ?? 60;
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO mp_webauthn_challenges (challenge, user_id, purpose, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)
       ON CONFLICT (challenge) DO NOTHING`,
      [args.challenge, args.userId, args.purpose, String(ttl)],
    );

    // Best-effort cleanup: usuwamy expired/consumed > 1h. Bez tego tabela
    // rosłaby liniowo z każdą rejestracją.
    await c
      .query(
        `DELETE FROM mp_webauthn_challenges
         WHERE expires_at < now() - interval '1 hour'
            OR consumed_at < now() - interval '1 hour'`,
      )
      .catch(() => undefined);
  });
}

/**
 * Atomically consume challenge — zwraca true gdy challenge istniał, należy
 * do `userId`, nie wygasł i nie był jeszcze użyty. Operacja jest idempotent
 * (drugie wywołanie z tym samym challenge zwróci false → register fail).
 */
export async function consumeChallenge(args: {
  challenge: string;
  userId: string;
  purpose?: string;
}): Promise<boolean> {
  await ensureSchema();
  return withClient(async (c) => {
    const purposeFilter = args.purpose ? "AND purpose = $3" : "";
    const params: unknown[] = [args.challenge, args.userId];
    if (args.purpose) params.push(args.purpose);
    const r = await c.query<{ challenge: string }>(
      `UPDATE mp_webauthn_challenges
          SET consumed_at = now()
        WHERE challenge = $1
          AND user_id = $2
          AND expires_at > now()
          AND consumed_at IS NULL
          ${purposeFilter}
        RETURNING challenge`,
      params,
    );
    return (r.rowCount ?? 0) > 0;
  });
}
