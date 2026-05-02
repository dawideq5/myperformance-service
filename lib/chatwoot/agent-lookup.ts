import { log } from "@/lib/logger";

const logger = log.child({ module: "chatwoot-agent-lookup" });

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
 * Resolve emaile wszystkich agentów (admin+agent) w danym inboxie. Używane
 * gdy webhook Chatwoot dostarczy `message_created` BEZ assignee — fan-out
 * notify do wszystkich osób mających dostęp do skrzynki.
 *
 * Endpoint: GET /api/v1/accounts/{aid}/inboxes/{iid}/agents — zwraca pełne
 * obiekty user z email. Wymaga user-level api_access_token (nie platform).
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

  const baseUrl = (process.env.CHATWOOT_URL ?? "").replace(/\/$/, "");
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  const apiToken =
    process.env.CHATWOOT_API_ACCESS_TOKEN ?? process.env.CHATWOOT_PLATFORM_TOKEN;
  if (!baseUrl || !accountId || !apiToken) {
    logger.warn("chatwoot account API not configured for inbox agents");
    return [];
  }

  try {
    const res = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/inboxes/${inboxId}/agents`,
      {
        headers: {
          api_access_token: apiToken,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) {
      logger.warn("chatwoot inbox agents fetch failed", {
        status: res.status,
        inboxId,
      });
      inboxAgentsCache.set(inboxId, { agents: [], fetchedAt: Date.now() });
      return [];
    }
    const data = (await res.json()) as ChatwootInboxAgent[];
    inboxAgentsCache.set(inboxId, { agents: data, fetchedAt: Date.now() });
    return data
      .map((a) => a.email)
      .filter((e): e is string => typeof e === "string" && e.length > 0);
  } catch (err) {
    logger.warn("chatwoot inbox agents lookup error", {
      inboxId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
