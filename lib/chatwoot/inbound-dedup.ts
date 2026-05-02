import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "chatwoot-inbound-dedup" });

/**
 * Per-message deduplication for inbound Chatwoot webhooks. Chatwoot may
 * resend the same `message_created` event (network retry, reconnect) — we
 * MUST treat the second hit as a no-op so we don't double-notify.
 *
 * Storage: append-only `mp_chatwoot_inbound_seen` (message_id PK).
 * Retention: 30 days (cleaned by lib/security/jobs sweep).
 */

let schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient((c) =>
    c.query(`
      CREATE TABLE IF NOT EXISTS mp_chatwoot_inbound_seen (
        message_id        BIGINT PRIMARY KEY,
        conversation_id   BIGINT,
        service_id        UUID,
        ticket_number     TEXT,
        seen_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS mp_chatwoot_inbound_seen_age_idx
        ON mp_chatwoot_inbound_seen (seen_at);
    `),
  );
  schemaReady = true;
}

/**
 * Try-claim a webhook message — returns true when we are the first observer
 * (process pipeline as usual), false when we have already processed it
 * (caller should short-circuit with 200 OK ignored).
 */
export async function claimInboundMessage(args: {
  messageId: number;
  conversationId?: number | null;
  serviceId?: string | null;
  ticketNumber?: string | null;
}): Promise<boolean> {
  if (!Number.isFinite(args.messageId)) return true; // can't dedup, fail-open
  try {
    await ensureSchema();
    const r = await withClient((c) =>
      c.query<{ message_id: string }>(
        `INSERT INTO mp_chatwoot_inbound_seen
           (message_id, conversation_id, service_id, ticket_number)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (message_id) DO NOTHING
         RETURNING message_id`,
        [
          args.messageId,
          args.conversationId ?? null,
          args.serviceId ?? null,
          args.ticketNumber ?? null,
        ],
      ),
    );
    // RETURNING zwraca 0 wierszy → już istniał (duplikat).
    return (r.rowCount ?? 0) > 0;
  } catch (err) {
    logger.warn("claimInboundMessage failed", { err: String(err) });
    return true; // fail-open — lepiej możliwy duplikat niż utrata wiadomości
  }
}
