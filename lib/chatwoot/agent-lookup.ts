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
