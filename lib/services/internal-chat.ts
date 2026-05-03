import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "service-internal-chat" });

/**
 * Wewnętrzny chat sprzedawca <-> serwisant w obrębie jednego zlecenia.
 *
 * Decyzja: custom DB-based zamiast nowego inboxu Chatwoota — niższy koszt
 * infrastruktury, brak zależności od websocketów Chatwoota, ścisła
 * integracja z existing service-detail UI (lokalne notify przez
 * mp_inbox + bell).
 *
 * Schema:
 *   mp_service_internal_messages
 *     id                   uuid PK
 *     service_id           uuid (FK logiczne na mp_services.id; brak ON DELETE
 *                          bo Directus nie zarządza)
 *     body                 text (max 4 KiB egzekwowane w app)
 *     author_email         text (KC email; do RBAC + display)
 *     author_role          text (sales|service)
 *     author_name          text NULL — Wave 22/F9 cached display name
 *                          (firstName lastName z KC profile w momencie zapisu)
 *     author_first_name    text NULL — Wave 22/F9
 *     author_last_name     text NULL — Wave 22/F9
 *     created_at           timestamptz default now()
 *     read_by_recipient_at timestamptz NULL
 */

export type AuthorRole = "sales" | "service";

export interface InternalMessage {
  id: string;
  serviceId: string;
  body: string;
  authorEmail: string;
  authorRole: AuthorRole;
  authorName: string | null;
  authorFirstName: string | null;
  authorLastName: string | null;
  createdAt: string;
  readByRecipientAt: string | null;
}

interface Row {
  id: string;
  service_id: string;
  body: string;
  author_email: string;
  author_role: AuthorRole;
  author_name: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  created_at: string;
  read_by_recipient_at: string | null;
}

let schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient((c) =>
    c.query(`
      CREATE TABLE IF NOT EXISTS mp_service_internal_messages (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_id             UUID NOT NULL,
        body                   TEXT NOT NULL,
        author_email           TEXT NOT NULL,
        author_role            TEXT NOT NULL CHECK (author_role IN ('sales','service')),
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        read_by_recipient_at   TIMESTAMPTZ
      );
      -- Wave 22 / F9 — cache imienia/nazwiska autora (z KC profile w czasie
      -- zapisu) żeby UI nie musiał derive'ować z email local-part. Stare wpisy
      -- zostają z NULL (display fallback do email local-part w UI).
      ALTER TABLE mp_service_internal_messages
        ADD COLUMN IF NOT EXISTS author_name TEXT;
      ALTER TABLE mp_service_internal_messages
        ADD COLUMN IF NOT EXISTS author_first_name TEXT;
      ALTER TABLE mp_service_internal_messages
        ADD COLUMN IF NOT EXISTS author_last_name TEXT;
      CREATE INDEX IF NOT EXISTS mp_svc_internal_msgs_svc_idx
        ON mp_service_internal_messages (service_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS mp_svc_internal_msgs_unread_idx
        ON mp_service_internal_messages (service_id)
        WHERE read_by_recipient_at IS NULL;
    `),
  );
  schemaReady = true;
}

function mapRow(r: Row): InternalMessage {
  return {
    id: r.id,
    serviceId: r.service_id,
    body: r.body,
    authorEmail: r.author_email,
    authorRole: r.author_role,
    authorName: r.author_name ?? null,
    authorFirstName: r.author_first_name ?? null,
    authorLastName: r.author_last_name ?? null,
    createdAt:
      typeof r.created_at === "string"
        ? r.created_at
        : new Date(r.created_at).toISOString(),
    readByRecipientAt:
      r.read_by_recipient_at == null
        ? null
        : typeof r.read_by_recipient_at === "string"
          ? r.read_by_recipient_at
          : new Date(r.read_by_recipient_at).toISOString(),
  };
}

export async function listInternalMessages(
  serviceId: string,
  limit = 200,
): Promise<InternalMessage[]> {
  await ensureSchema();
  const lim = Math.min(Math.max(limit, 1), 500);
  try {
    const r = await withClient((c) =>
      c.query<Row>(
        `SELECT id, service_id, body, author_email, author_role,
                author_name, author_first_name, author_last_name,
                created_at, read_by_recipient_at
           FROM mp_service_internal_messages
          WHERE service_id = $1
          ORDER BY created_at ASC
          LIMIT $2`,
        [serviceId, lim],
      ),
    );
    return r.rows.map(mapRow);
  } catch (err) {
    logger.warn("listInternalMessages failed", {
      serviceId,
      err: String(err),
    });
    return [];
  }
}

export async function createInternalMessage(args: {
  serviceId: string;
  body: string;
  authorEmail: string;
  authorRole: AuthorRole;
  authorFirstName?: string | null;
  authorLastName?: string | null;
  authorName?: string | null;
}): Promise<InternalMessage | null> {
  await ensureSchema();
  const body = args.body.trim().slice(0, 4096);
  if (!body) return null;
  // Wave 22 / F9 — cache full display name w bazie. Czytamy z parametrów
  // (caller wyciąga z `PanelUser.firstName/lastName`); fallback do null gdy
  // brak — UI ma własny fallback (email local-part dla legacy rekordów).
  const firstName = args.authorFirstName?.trim() || null;
  const lastName = args.authorLastName?.trim() || null;
  const composedName =
    args.authorName?.trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    null;
  try {
    const r = await withClient((c) =>
      c.query<Row>(
        `INSERT INTO mp_service_internal_messages
           (service_id, body, author_email, author_role,
            author_name, author_first_name, author_last_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, service_id, body, author_email, author_role,
                   author_name, author_first_name, author_last_name,
                   created_at, read_by_recipient_at`,
        [
          args.serviceId,
          body,
          args.authorEmail,
          args.authorRole,
          composedName,
          firstName,
          lastName,
        ],
      ),
    );
    const row = r.rows[0];
    return row ? mapRow(row) : null;
  } catch (err) {
    logger.warn("createInternalMessage failed", {
      serviceId: args.serviceId,
      err: String(err),
    });
    return null;
  }
}

/**
 * Mark wszystkie wiadomości w zleceniu jako przeczytane przez recipienta —
 * recipient = "rola przeciwna" do `viewerRole`. Wywołane przy POST
 * mark-read endpoint.
 */
export async function markInternalRead(
  serviceId: string,
  viewerRole: AuthorRole,
): Promise<number> {
  await ensureSchema();
  // Recipient = rola przeciwna do autora — sprzedawca czyta wiadomości od
  // serwisanta i odwrotnie.
  const otherRole: AuthorRole = viewerRole === "sales" ? "service" : "sales";
  try {
    const r = await withClient((c) =>
      c.query<{ id: string }>(
        `UPDATE mp_service_internal_messages
            SET read_by_recipient_at = now()
          WHERE service_id = $1
            AND author_role = $2
            AND read_by_recipient_at IS NULL
          RETURNING id`,
        [serviceId, otherRole],
      ),
    );
    return r.rowCount ?? 0;
  } catch (err) {
    logger.warn("markInternalRead failed", {
      serviceId,
      err: String(err),
    });
    return 0;
  }
}

/**
 * Liczy wiadomości nieprzeczytane przez `viewerRole` w danym zleceniu —
 * wykorzystywane do badge w nagłówku zakładki "Czat zespołu".
 */
export async function countUnread(
  serviceId: string,
  viewerRole: AuthorRole,
): Promise<number> {
  await ensureSchema();
  const otherRole: AuthorRole = viewerRole === "sales" ? "service" : "sales";
  try {
    const r = await withClient((c) =>
      c.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
           FROM mp_service_internal_messages
          WHERE service_id = $1
            AND author_role = $2
            AND read_by_recipient_at IS NULL`,
        [serviceId, otherRole],
      ),
    );
    return Number(r.rows[0]?.n ?? "0");
  } catch (err) {
    logger.warn("countUnread failed", {
      serviceId,
      err: String(err),
    });
    return 0;
  }
}
