import { withClient } from "@/lib/db";

/**
 * Per-source webhook health: ostatni hit, wynik, secret status.
 * Dane tylko w pamięci procesu — restart resetuje. Dla audit trail
 * dodatkowo INSERT do mp_webhook_hits (ring buffer ostatnie 100).
 */

export type WebhookSource =
  | "chatwoot"
  | "outline"
  | "moodle"
  | "documenso"
  | "keycloak"
  | "backup"
  | "wazuh"
  | "livekit";

export type WebhookOutcome = "ok" | "auth_failed" | "ignored" | "error";

interface InMemoryHit {
  at: number;
  outcome: WebhookOutcome;
  event?: string;
  detail?: string;
}

const lastHit = new Map<WebhookSource, InMemoryHit>();
let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient((c) =>
    c.query(`
      CREATE TABLE IF NOT EXISTS mp_webhook_hits (
        id        BIGSERIAL PRIMARY KEY,
        source    TEXT NOT NULL,
        at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        outcome   TEXT NOT NULL,
        event     TEXT,
        detail    TEXT
      );
      CREATE INDEX IF NOT EXISTS mp_webhook_hits_src_at_idx
        ON mp_webhook_hits (source, at DESC);
    `),
  );
  schemaReady = true;
}

export async function recordWebhookHit(
  source: WebhookSource,
  outcome: WebhookOutcome,
  event?: string,
  detail?: string,
): Promise<void> {
  const hit: InMemoryHit = { at: Date.now(), outcome, event, detail };
  lastHit.set(source, hit);
  try {
    await ensureSchema();
    await withClient((c) =>
      c.query(
        `INSERT INTO mp_webhook_hits (source, outcome, event, detail) VALUES ($1, $2, $3, $4)`,
        [source, outcome, event ?? null, detail ?? null],
      ),
    );
  } catch {
    /* in-memory zostaje, DB best-effort */
  }
}

export interface WebhookHealth {
  source: WebhookSource;
  secretConfigured: boolean;
  lastHit: { at: string; outcome: WebhookOutcome; event?: string; detail?: string } | null;
  recentHits: Array<{ at: string; outcome: WebhookOutcome; event?: string; detail?: string }>;
  recentOkCount: number;
  recentAuthFailCount: number;
}

const SECRET_ENV: Record<WebhookSource, string> = {
  chatwoot: "CHATWOOT_WEBHOOK_SECRET",
  outline: "OUTLINE_WEBHOOK_SECRET",
  moodle: "MOODLE_WEBHOOK_SECRET",
  documenso: "DOCUMENSO_WEBHOOK_SECRET",
  keycloak: "KEYCLOAK_WEBHOOK_SECRET",
  backup: "BACKUP_WEBHOOK_SECRET",
  wazuh: "WAZUH_WEBHOOK_SECRET",
  // LiveKit auth header is signed with `LIVEKIT_API_SECRET` (not a separate
  // webhook secret) — see WebhookReceiver in livekit-server-sdk.
  livekit: "LIVEKIT_API_SECRET",
};

export async function getWebhookHealth(
  source: WebhookSource,
): Promise<WebhookHealth> {
  const secretConfigured = Boolean(process.env[SECRET_ENV[source]]?.trim());
  const lastInMem = lastHit.get(source) ?? null;
  let recentHits: WebhookHealth["recentHits"] = [];
  let recentOkCount = 0;
  let recentAuthFailCount = 0;
  try {
    await ensureSchema();
    const r = await withClient((c) =>
      c.query<{ at: string; outcome: string; event: string | null; detail: string | null }>(
        `SELECT at::text AS at, outcome, event, detail
           FROM mp_webhook_hits
          WHERE source = $1 AND at > now() - INTERVAL '24 hours'
          ORDER BY at DESC LIMIT 50`,
        [source],
      ),
    );
    recentHits = r.rows.map((row) => ({
      at: row.at,
      outcome: row.outcome as WebhookOutcome,
      event: row.event ?? undefined,
      detail: row.detail ?? undefined,
    }));
    recentOkCount = recentHits.filter((h) => h.outcome === "ok").length;
    recentAuthFailCount = recentHits.filter((h) => h.outcome === "auth_failed").length;
  } catch {
    /* fallback na in-memory only */
  }
  return {
    source,
    secretConfigured,
    lastHit: lastInMem
      ? {
          at: new Date(lastInMem.at).toISOString(),
          outcome: lastInMem.outcome,
          event: lastInMem.event,
          detail: lastInMem.detail,
        }
      : recentHits[0] ?? null,
    recentHits,
    recentOkCount,
    recentAuthFailCount,
  };
}
