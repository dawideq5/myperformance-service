/**
 * Chatwoot — polling job dla nieprzeczytanych wiadomości.
 *
 * Strategia: zamiast pollować Chatwoot DB (tabele `conversations` +
 * `messages` + `account_users`) bezpośrednio — używamy Platform API
 * `/api/v2/accounts/{id}/reports/conversations_filter?type=conversation&page=1`
 * lub starszego `/auth/sign_in` dla per-user tokena. To zbyt skomplikowane
 * dla MVP; tutaj robimy najprostszą wersję:
 *
 *   1) Listujemy account_users (Chatwoot Platform API).
 *   2) Dla każdego agenta: GET `/api/v1/accounts/{aid}/conversations`
 *      filtered by `assignee_type=me` (musimy podpiąć user_access_token,
 *      Chatwoot Platform API tego nie udostępnia bezpośrednio — fallback:
 *      filtrujemy po assignee_id po stronie webhooka).
 *
 * Faktycznie webhook `message_created` z route /api/webhooks/chatwoot już
 * pokrywa real-time delivery. Ten polling job działa jako bezpiecznik:
 * raz na X minut sprawdza `unread_count` per assigned user przez query
 * do Chatwoot Postgres (CHATWOOT_DATABASE_URL) i emituje
 * `chatwoot.unread_message` jeśli wzrosło od ostatniego cyklu.
 *
 * Stan per user: `mp_chatwoot_inbox_cursor` (user_id → last_seen_msg_id).
 */
import { withClient, withExternalClient, ExternalServiceUnavailableError } from "@/lib/db";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { getOptionalEnv } from "@/lib/env";

const logger = log.child({ module: "chatwoot-notifications" });

interface UnreadRow {
  agent_email: string;
  agent_name: string;
  conversation_id: number;
  inbox_name: string | null;
  contact_name: string | null;
  last_message_id: number;
  last_message_content: string | null;
  unread_count: number;
}

async function ensureCursorTable(): Promise<void> {
  await withClient((c) =>
    c.query(`
      CREATE TABLE IF NOT EXISTS mp_chatwoot_inbox_cursor (
        kc_user_id      TEXT NOT NULL,
        conversation_id BIGINT NOT NULL,
        last_msg_id     BIGINT NOT NULL,
        notified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (kc_user_id, conversation_id)
      );
    `),
  );
}

/**
 * Single poll cycle. Best-effort — failures są logowane, nie throwowane.
 *
 * `CHATWOOT_DATABASE_URL` musi wskazywać na Chatwoot Postgresa (read-only
 * userem wystarczy). Jeśli env brak — funkcja loguje warn raz i zwraca 0.
 */
export async function pollChatwootUnread(): Promise<{ processed: number }> {
  const dbUrl = getOptionalEnv("CHATWOOT_DATABASE_URL").trim();
  if (!dbUrl) {
    logger.debug("CHATWOOT_DATABASE_URL not set — skip polling cycle");
    return { processed: 0 };
  }

  await ensureCursorTable();

  // Chatwoot schema:
  //   conversations.assignee_id → users.id
  //   messages.conversation_id, messages.message_type (0=incoming),
  //     messages.id (autoinc)
  //   conversations.contact_last_seen_at vs messages.created_at — agent
  //     unread = messages with id > conversation.agent_last_seen_at_id?
  //     Chatwoot tracks `agent_last_seen_at` (timestamp).
  // MVP: pobieramy konwersacje gdzie ostatnia wiadomość incoming jest
  // nowsza niż `agent_last_seen_at`.
  let rows: UnreadRow[];
  try {
    rows = await withExternalClient("CHATWOOT_DATABASE_URL", async (c) => {
      const r = await c.query<UnreadRow>(`
        SELECT u.email AS agent_email,
               u.name AS agent_name,
               c.id AS conversation_id,
               i.name AS inbox_name,
               ct.name AS contact_name,
               last_msg.id AS last_message_id,
               last_msg.content AS last_message_content,
               1 AS unread_count
          FROM conversations c
          JOIN users u ON u.id = c.assignee_id
          JOIN inboxes i ON i.id = c.inbox_id
          LEFT JOIN contacts ct ON ct.id = c.contact_id
          JOIN LATERAL (
            SELECT id, content, created_at
              FROM messages
             WHERE conversation_id = c.id
               AND message_type = 0
             ORDER BY id DESC
             LIMIT 1
          ) last_msg ON true
         WHERE c.status = 0
           AND (c.agent_last_seen_at IS NULL
                OR last_msg.created_at > c.agent_last_seen_at)
         ORDER BY last_msg.id DESC
         LIMIT 200
      `);
      return r.rows;
    });
  } catch (err) {
    if (err instanceof ExternalServiceUnavailableError) return { processed: 0 };
    logger.warn("chatwoot DB query failed", { err: String(err) });
    return { processed: 0 };
  }

  let processed = 0;
  for (const row of rows) {
    if (!row.agent_email) continue;
    const kcUserId = await getUserIdByEmail(row.agent_email).catch(() => null);
    if (!kcUserId) continue;

    // Sprawdź cursor: czy już powiadomiliśmy o tym last_message_id?
    const seen = await withClient(async (c) => {
      const r = await c.query<{ last_msg_id: string }>(
        `SELECT last_msg_id::text FROM mp_chatwoot_inbox_cursor
          WHERE kc_user_id = $1 AND conversation_id = $2`,
        [kcUserId, row.conversation_id],
      );
      return r.rows[0]?.last_msg_id;
    });
    if (seen && Number(seen) >= row.last_message_id) continue;

    const senderLabel = row.contact_name ?? "klient";
    const inboxLabel = row.inbox_name ?? "Chatwoot";
    const preview = (row.last_message_content ?? "").slice(0, 120);

    await notifyUser(kcUserId, "chatwoot.unread_message", {
      title: "Nieprzeczytana wiadomość w Chatwoocie",
      body: `Od: ${senderLabel}, na kanale: ${inboxLabel}${preview ? ` — „${preview}${row.last_message_content && row.last_message_content.length > 120 ? "…" : ""}"` : ""}`,
      severity: "info",
      payload: {
        conversationId: row.conversation_id,
        inbox: inboxLabel,
        link: chatwootDeepLink(row.conversation_id),
      },
    }).catch((err) =>
      logger.warn("notify chatwoot.unread_message failed", {
        kcUserId,
        err: String(err),
      }),
    );

    await withClient((c) =>
      c.query(
        `INSERT INTO mp_chatwoot_inbox_cursor (kc_user_id, conversation_id, last_msg_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (kc_user_id, conversation_id)
         DO UPDATE SET last_msg_id = EXCLUDED.last_msg_id, notified_at = now()`,
        [kcUserId, row.conversation_id, row.last_message_id],
      ),
    ).catch((err) =>
      logger.warn("cursor save failed", {
        kcUserId,
        err: String(err),
      }),
    );

    processed++;
  }

  if (processed > 0) {
    logger.info("chatwoot unread poll cycle", { processed });
  }
  return { processed };
}

function chatwootDeepLink(conversationId: number): string {
  const base = (getOptionalEnv("CHATWOOT_URL").trim() || "https://chat.myperformance.pl").replace(/\/$/, "");
  const accountId = Number(getOptionalEnv("CHATWOOT_ACCOUNT_ID", "1").trim()) || 1;
  return `${base}/app/accounts/${accountId}/conversations/${conversationId}`;
}
