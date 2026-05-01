import { log } from "@/lib/logger";

const logger = log.child({ module: "chatwoot-agent-lookup" });

interface CachedAgent {
  email: string | null;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<number, CachedAgent>();

interface ChatwootAccountUser {
  user_id?: number;
  user?: { id?: number; email?: string };
  email?: string;
}

/**
 * Resolve Chatwoot agent (user) email po user_id. Chatwoot Account Webhooks
 * wysyłają assignee jako `{id, name, type}` bez emaila — żeby zmapować
 * na KC user (notifyUser) potrzebujemy emaila. Platform API zwraca pełną
 * listę account_users, każdy z embedded user.email.
 *
 * Cache 5 min in-memory — agent emails rzadko się zmieniają, redukuje
 * Platform API calls przy każdym webhook.
 */
export async function getChatwootAgentEmail(
  chatwootUserId: number,
): Promise<string | null> {
  const cached = cache.get(chatwootUserId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.email;
  }

  const baseUrl = (process.env.CHATWOOT_URL ?? "").replace(/\/$/, "");
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  const platformToken = process.env.CHATWOOT_PLATFORM_TOKEN;
  if (!baseUrl || !accountId || !platformToken) {
    logger.warn("chatwoot platform API not configured", {
      hasUrl: !!baseUrl,
      hasAccount: !!accountId,
      hasToken: !!platformToken,
    });
    return null;
  }

  try {
    const res = await fetch(
      `${baseUrl}/platform/api/v1/accounts/${accountId}/account_users`,
      {
        headers: {
          api_access_token: platformToken,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) {
      logger.warn("chatwoot account_users fetch failed", { status: res.status });
      return null;
    }
    const data = (await res.json()) as ChatwootAccountUser[];
    let foundEmail: string | null = null;
    for (const row of data) {
      const userId = row.user?.id ?? row.user_id;
      const email = row.user?.email ?? row.email ?? null;
      if (typeof userId === "number" && email) {
        cache.set(userId, { email, fetchedAt: Date.now() });
        if (userId === chatwootUserId) foundEmail = email;
      }
    }
    if (!foundEmail) {
      cache.set(chatwootUserId, { email: null, fetchedAt: Date.now() });
    }
    return foundEmail;
  } catch (err) {
    logger.warn("chatwoot agent lookup error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
