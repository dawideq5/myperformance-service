/**
 * In-memory token-bucket rate limiter. Designed for a single Next.js process
 * (Coolify deployment runs one container by default). For horizontal scale,
 * swap to Redis/Upstash — interface is intentionally minimal.
 *
 * Buckets are keyed by (route, identity). Identity is typically the
 * Keycloak user id or remote IP.
 */

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max tokens in the bucket. Equivalent to burst capacity. */
  capacity: number;
  /** Token refill rate, tokens per second. */
  refillPerSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  const capacity = opts.capacity;
  const refillPerMs = opts.refillPerSec / 1000;

  let tokens: number;
  if (!existing) {
    tokens = capacity;
  } else {
    const delta = now - existing.updatedAt;
    tokens = Math.min(capacity, existing.tokens + delta * refillPerMs);
  }

  if (tokens >= 1) {
    tokens -= 1;
    buckets.set(key, { tokens, updatedAt: now });
    return {
      allowed: true,
      remaining: Math.floor(tokens),
      retryAfterMs: 0,
    };
  }

  buckets.set(key, { tokens, updatedAt: now });
  const retryAfterMs = Math.ceil((1 - tokens) / refillPerMs);
  return { allowed: false, remaining: 0, retryAfterMs };
}

/** Best-effort identity for a request. Prefer session userId when available. */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Periodically sweep stale buckets to avoid unbounded growth. No-op when the
 * map is already small. Run lazily from call sites.
 */
export function sweepStaleBuckets(olderThanMs = 10 * 60 * 1000) {
  if (buckets.size < 500) return;
  const cutoff = Date.now() - olderThanMs;
  for (const [key, bucket] of buckets) {
    if (bucket.updatedAt < cutoff) buckets.delete(key);
  }
}
