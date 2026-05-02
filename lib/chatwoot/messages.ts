import { ExternalServiceUnavailableError, withExternalClient } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * Chatwoot conversations + messages lookup po contact email — używa DB
 * bezpośrednio (CHATWOOT_DB_URL). Filtrujemy tylko email-channel inboxy
 * (`channels.type = 'Channel::Email'`).
 *
 * Schema Chatwoot (Postgres):
 *   contacts(id, email, name)
 *   contact_inboxes(id, contact_id, inbox_id, source_id) — source_id zawiera email dla email-inbox
 *   inboxes(id, name, channel_type, channel_id) — channel_type='Channel::Email'
 *   conversations(id, status, contact_inbox_id, inbox_id, account_id, created_at, updated_at)
 *   messages(id, conversation_id, content, message_type, created_at, sender_type, sender_id)
 *   attachments(id, message_id, file_type, external_url, account_id)
 *
 * Best-effort: ExternalServiceUnavailableError → puste wyniki.
 */

const logger = log.child({ module: "chatwoot-messages" });

export interface ChatwootConversationSummary {
  id: number;
  status: number;
  contactEmail: string;
  inboxName: string;
  createdAt: string;
  updatedAt: string;
  /** Liczba wiadomości w konwersacji. */
  messageCount: number;
}

export interface ChatwootMessage {
  id: number;
  conversationId: number;
  /** 0=incoming, 1=outgoing, 2=activity, 3=template */
  messageType: number;
  content: string | null;
  contentType: string | null;
  senderType: string | null;
  senderName: string | null;
  createdAt: string;
  attachments: Array<{
    id: number;
    fileType: string | null;
    externalUrl: string | null;
  }>;
}

/**
 * Lista konwersacji dla adresu email — joinuje przez contact_inboxes
 * tylko email-channel inboxy. Sortowane po updated_at DESC.
 */
export async function listConversationsForContact(
  email: string,
  limit = 50,
): Promise<ChatwootConversationSummary[]> {
  if (!email) return [];
  try {
    return await withExternalClient("CHATWOOT_DB_URL", async (c) => {
      const r = await c.query<{
        id: number;
        status: number;
        contact_email: string | null;
        inbox_name: string;
        created_at: Date;
        updated_at: Date;
        message_count: string;
      }>(
        `SELECT c.id,
                c.status,
                COALESCE(ct.email, ci.source_id) AS contact_email,
                i.name AS inbox_name,
                c.created_at,
                c.updated_at,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
           FROM conversations c
           JOIN contact_inboxes ci ON ci.id = c.contact_inbox_id
           JOIN inboxes i ON i.id = c.inbox_id
           LEFT JOIN contacts ct ON ct.id = ci.contact_id
          WHERE i.channel_type = 'Channel::Email'
            AND (LOWER(ct.email) = LOWER($1) OR LOWER(ci.source_id) = LOWER($1))
          ORDER BY c.updated_at DESC
          LIMIT $2`,
        [email, limit],
      );
      return r.rows.map((row) => ({
        id: row.id,
        status: row.status,
        contactEmail: row.contact_email ?? email,
        inboxName: row.inbox_name,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        messageCount: Number(row.message_count) || 0,
      }));
    });
  } catch (err) {
    if (err instanceof ExternalServiceUnavailableError) return [];
    logger.warn("chatwoot conversations lookup failed", {
      email,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Pełna lista wiadomości w konwersacji (sortowane po created_at ASC).
 * Doczytujemy attachments jednym dodatkowym query, żeby uniknąć N+1.
 */
export async function listMessagesForConversation(
  convId: number,
  limit = 200,
): Promise<ChatwootMessage[]> {
  if (!convId) return [];
  try {
    return await withExternalClient("CHATWOOT_DB_URL", async (c) => {
      const m = await c.query<{
        id: number;
        conversation_id: number;
        message_type: number;
        content: string | null;
        content_type: string | null;
        sender_type: string | null;
        sender_id: number | null;
        created_at: Date;
      }>(
        `SELECT id, conversation_id, message_type, content, content_type,
                sender_type, sender_id, created_at
           FROM messages
          WHERE conversation_id = $1
          ORDER BY created_at ASC, id ASC
          LIMIT $2`,
        [convId, limit],
      );
      const messageIds = m.rows.map((row) => row.id);

      // Sender names — Chatwoot polymorphic (User|Contact|AgentBot). Dla uproszczenia
      // sięgamy do users + contacts gdy sender_type matchuje.
      const senderUsersIds: number[] = [];
      const senderContactsIds: number[] = [];
      for (const row of m.rows) {
        if (row.sender_id == null) continue;
        if (row.sender_type === "User") senderUsersIds.push(row.sender_id);
        else if (row.sender_type === "Contact") senderContactsIds.push(row.sender_id);
      }

      const userNames = new Map<number, string>();
      const contactNames = new Map<number, string>();
      if (senderUsersIds.length > 0) {
        const ur = await c.query<{ id: number; name: string | null; email: string | null }>(
          `SELECT id, name, email FROM users WHERE id = ANY($1::int[])`,
          [senderUsersIds],
        );
        for (const u of ur.rows) {
          userNames.set(u.id, u.name ?? u.email ?? `user#${u.id}`);
        }
      }
      if (senderContactsIds.length > 0) {
        const cr = await c.query<{ id: number; name: string | null; email: string | null }>(
          `SELECT id, name, email FROM contacts WHERE id = ANY($1::int[])`,
          [senderContactsIds],
        );
        for (const cc of cr.rows) {
          contactNames.set(cc.id, cc.name ?? cc.email ?? `contact#${cc.id}`);
        }
      }

      // Attachments
      const attachmentsByMsg = new Map<number, ChatwootMessage["attachments"]>();
      if (messageIds.length > 0) {
        const a = await c.query<{
          id: number;
          message_id: number;
          file_type: string | null;
          external_url: string | null;
        }>(
          `SELECT id, message_id, file_type, external_url
             FROM attachments WHERE message_id = ANY($1::int[])`,
          [messageIds],
        );
        for (const row of a.rows) {
          const arr = attachmentsByMsg.get(row.message_id) ?? [];
          arr.push({
            id: row.id,
            fileType: row.file_type,
            externalUrl: row.external_url,
          });
          attachmentsByMsg.set(row.message_id, arr);
        }
      }

      return m.rows.map((row) => {
        let senderName: string | null = null;
        if (row.sender_id != null) {
          if (row.sender_type === "User") senderName = userNames.get(row.sender_id) ?? null;
          else if (row.sender_type === "Contact")
            senderName = contactNames.get(row.sender_id) ?? null;
        }
        return {
          id: row.id,
          conversationId: row.conversation_id,
          messageType: row.message_type,
          content: row.content,
          contentType: row.content_type,
          senderType: row.sender_type,
          senderName,
          createdAt: row.created_at.toISOString(),
          attachments: attachmentsByMsg.get(row.id) ?? [],
        };
      });
    });
  } catch (err) {
    if (err instanceof ExternalServiceUnavailableError) return [];
    logger.warn("chatwoot messages lookup failed", {
      convId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** True gdy CHATWOOT_DB_URL skonfigurowany (do UI message). */
export function isChatwootDbConfigured(): boolean {
  return !!process.env.CHATWOOT_DB_URL?.trim();
}

/**
 * Lookup pojedynczego attachmentu (by id) — używane przez attachment proxy
 * route do pobrania `external_url` zanim zrobimy fetch + stream do clienta.
 */
export async function getChatwootAttachment(
  attachmentId: number,
): Promise<{
  fileType: string | null;
  externalUrl: string | null;
  messageId: number | null;
} | null> {
  if (!attachmentId) return null;
  try {
    return await withExternalClient("CHATWOOT_DB_URL", async (c) => {
      const r = await c.query<{
        file_type: string | null;
        external_url: string | null;
        message_id: number | null;
      }>(
        `SELECT file_type, external_url, message_id
           FROM attachments WHERE id = $1`,
        [attachmentId],
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        fileType: row.file_type,
        externalUrl: row.external_url,
        messageId: row.message_id,
      };
    });
  } catch (err) {
    if (err instanceof ExternalServiceUnavailableError) return null;
    logger.warn("chatwoot attachment lookup failed", {
      attachmentId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
