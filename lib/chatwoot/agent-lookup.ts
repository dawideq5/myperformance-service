import { Pool } from "pg";
import { log } from "@/lib/logger";

const logger = log.child({ module: "chatwoot-agent-lookup" });

let chatwootDbPool: Pool | null = null;
function getChatwootDb(): Pool | null {
  if (chatwootDbPool) return chatwootDbPool;
  const url = process.env.CHATWOOT_DB_URL?.trim();
  if (!url) return null;
  chatwootDbPool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  chatwootDbPool.on("error", (err) =>
    logger.error("chatwoot-db pool error", { err: err.message }),
  );
  return chatwootDbPool;
}

interface CachedAgent {
  email: string | null;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<number, CachedAgent>();

interface ChatwootUserResponse {
  id?: number;
  email?: string;
  name?: string;
}

interface ChatwootInboxAgent {
  id?: number;
  email?: string;
  name?: string;
}

interface CachedInboxAgents {
  agents: ChatwootInboxAgent[];
  fetchedAt: number;
}

const inboxAgentsCache = new Map<number, CachedInboxAgents>();

/**
 * Resolve Chatwoot agent email po user_id. Chatwoot Account Webhooks v3+
 * wysyłają assignee jako `{id, name, type}` bez emaila — żeby zmapować
 * na KC user (notifyUser) potrzebujemy emaila.
 *
 * Endpoint: GET /platform/api/v1/users/{id} — zwraca pełnego usera z email.
 * (Endpoint /accounts/{id}/account_users zwraca tylko user_id bez email).
 *
 * Cache 5 min in-memory — emails rzadko się zmieniają.
 */
export async function getChatwootAgentEmail(
  chatwootUserId: number,
): Promise<string | null> {
  const cached = cache.get(chatwootUserId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.email;
  }

  const baseUrl = (process.env.CHATWOOT_URL ?? "").replace(/\/$/, "");
  const platformToken = process.env.CHATWOOT_PLATFORM_TOKEN;
  if (!baseUrl || !platformToken) {
    logger.warn("chatwoot platform API not configured", {
      hasUrl: !!baseUrl,
      hasToken: !!platformToken,
    });
    return null;
  }

  try {
    const res = await fetch(
      `${baseUrl}/platform/api/v1/users/${chatwootUserId}`,
      {
        headers: {
          api_access_token: platformToken,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) {
      logger.warn("chatwoot user fetch failed", {
        status: res.status,
        userId: chatwootUserId,
      });
      cache.set(chatwootUserId, { email: null, fetchedAt: Date.now() });
      return null;
    }
    const data = (await res.json()) as ChatwootUserResponse;
    const email = data.email ?? null;
    cache.set(chatwootUserId, { email, fetchedAt: Date.now() });
    return email;
  } catch (err) {
    logger.warn("chatwoot agent lookup error", {
      userId: chatwootUserId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Resolve emaile wszystkich agentów w danym inboxie. Używane gdy webhook
 * Chatwoot dostarczy `message_created` BEZ assignee — fan-out notify do
 * wszystkich osób mających dostęp do skrzynki.
 *
 * Source: bezpośredni query do Chatwoot DB (`inbox_members JOIN users`).
 * Account API `/inboxes/{id}/agents` nie jest dostępne z platform tokenem
 * (zwraca 404 dla bot accounts), a setup user-level tokenu na każdy redeploy
 * jest fragile. DB connection string w CHATWOOT_DB_URL już mamy.
 *
 * Cache 5 min — agent membership w inboxie rzadko się zmienia.
 */
export async function getChatwootInboxAgentEmails(
  inboxId: number,
): Promise<string[]> {
  const cached = inboxAgentsCache.get(inboxId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.agents
      .map((a) => a.email)
      .filter((e): e is string => typeof e === "string" && e.length > 0);
  }

  const pool = getChatwootDb();
  if (!pool) {
    logger.warn("CHATWOOT_DB_URL nie ustawione — brak fan-out");
    return [];
  }

  try {
    // Account-admins są w roli "administrator" na poziomie account_users —
    // mają dostęp do wszystkich inboxów, więc dorzucamy ich do listy.
    const r = await pool.query<{ id: number; email: string; name: string | null }>(
      `SELECT u.id, u.email, u.name
         FROM users u
         JOIN inbox_members im ON im.user_id = u.id
        WHERE im.inbox_id = $1 AND u.email IS NOT NULL
        UNION
       SELECT u.id, u.email, u.name
         FROM users u
         JOIN account_users au ON au.user_id = u.id
        WHERE au.role = 0 AND u.email IS NOT NULL`,
      [inboxId],
    );
    const agents: ChatwootInboxAgent[] = r.rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name ?? undefined,
    }));
    inboxAgentsCache.set(inboxId, { agents, fetchedAt: Date.now() });
    return agents
      .map((a) => a.email)
      .filter((e): e is string => typeof e === "string" && e.length > 0);
  } catch (err) {
    logger.warn("chatwoot inbox agents DB lookup error", {
      inboxId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
