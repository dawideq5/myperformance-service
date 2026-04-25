import { Pool, type PoolClient } from "pg";
import { getOptionalEnv } from "@/lib/env";

let pool: Pool | null = null;

function getPool(): Pool {
  const url = getOptionalEnv("DATABASE_URL").trim();
  if (!url) throw new Error("DATABASE_URL not configured");
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

// ── Blocked IPs ─────────────────────────────────────────────────────────────

export interface BlockedIp {
  ip: string;
  reason: string;
  blockedAt: string;
  expiresAt: string | null;
  blockedBy: string;
  source: string;
  attempts: number;
  country: string | null;
  details: Record<string, unknown> | null;
}

export async function listBlockedIps(): Promise<BlockedIp[]> {
  return withClient(async (c) => {
    // Auto-cleanup wygasłych
    await c.query(`DELETE FROM mp_blocked_ips WHERE expires_at IS NOT NULL AND expires_at < now()`);
    const res = await c.query(
      `SELECT ip, reason, blocked_at, expires_at, blocked_by, source, attempts, country, details
         FROM mp_blocked_ips ORDER BY blocked_at DESC`,
    );
    return res.rows.map((r) => ({
      ip: r.ip,
      reason: r.reason,
      blockedAt: r.blocked_at.toISOString(),
      expiresAt: r.expires_at?.toISOString() ?? null,
      blockedBy: r.blocked_by,
      source: r.source,
      attempts: r.attempts,
      country: r.country,
      details: r.details,
    }));
  });
}

export async function blockIp(args: {
  ip: string;
  reason: string;
  blockedBy: string;
  source?: string;
  durationMinutes?: number;
  attempts?: number;
  country?: string;
  details?: Record<string, unknown>;
}): Promise<BlockedIp> {
  return withClient(async (c) => {
    const expires = args.durationMinutes
      ? `now() + interval '${Number(args.durationMinutes)} minutes'`
      : "NULL";
    await c.query(
      `INSERT INTO mp_blocked_ips
         (ip, reason, blocked_by, source, attempts, country, details, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ${expires})
       ON CONFLICT (ip) DO UPDATE SET
         reason = EXCLUDED.reason,
         blocked_by = EXCLUDED.blocked_by,
         source = EXCLUDED.source,
         attempts = mp_blocked_ips.attempts + EXCLUDED.attempts,
         country = COALESCE(EXCLUDED.country, mp_blocked_ips.country),
         details = EXCLUDED.details,
         expires_at = ${expires},
         blocked_at = now()`,
      [
        args.ip,
        args.reason,
        args.blockedBy,
        args.source ?? "manual",
        args.attempts ?? 1,
        args.country ?? null,
        args.details ? JSON.stringify(args.details) : null,
      ],
    );
    const res = await c.query(
      `SELECT ip, reason, blocked_at, expires_at, blocked_by, source, attempts, country, details
         FROM mp_blocked_ips WHERE ip = $1`,
      [args.ip],
    );
    const r = res.rows[0];
    return {
      ip: r.ip,
      reason: r.reason,
      blockedAt: r.blocked_at.toISOString(),
      expiresAt: r.expires_at?.toISOString() ?? null,
      blockedBy: r.blocked_by,
      source: r.source,
      attempts: r.attempts,
      country: r.country,
      details: r.details,
    };
  });
}

export async function unblockIp(ip: string): Promise<void> {
  await withClient((c) => c.query(`DELETE FROM mp_blocked_ips WHERE ip = $1`, [ip]));
}

// ── Security events ─────────────────────────────────────────────────────────

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface SecurityEvent {
  id: number;
  ts: string;
  severity: Severity;
  category: string;
  source: string;
  title: string;
  description: string | null;
  srcIp: string | null;
  targetUser: string | null;
  details: Record<string, unknown> | null;
  acknowledged: boolean;
}

export async function recordEvent(args: {
  severity: Severity;
  category: string;
  source: string;
  title: string;
  description?: string;
  srcIp?: string;
  targetUser?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await withClient((c) =>
    c.query(
      `INSERT INTO mp_security_events
         (severity, category, source, title, description, src_ip, target_user, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        args.severity,
        args.category,
        args.source,
        args.title,
        args.description ?? null,
        args.srcIp ?? null,
        args.targetUser ?? null,
        args.details ? JSON.stringify(args.details) : null,
      ],
    ),
  );
}

export async function listEvents(args: {
  limit?: number;
  offset?: number;
  severity?: Severity;
  category?: string;
  srcIp?: string;
  since?: Date;
} = {}): Promise<SecurityEvent[]> {
  return withClient(async (c) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (args.severity) {
      params.push(args.severity);
      where.push(`severity = $${params.length}`);
    }
    if (args.category) {
      params.push(args.category);
      where.push(`category = $${params.length}`);
    }
    if (args.srcIp) {
      params.push(args.srcIp);
      where.push(`src_ip = $${params.length}`);
    }
    if (args.since) {
      params.push(args.since);
      where.push(`ts >= $${params.length}`);
    }
    params.push(args.limit ?? 100);
    params.push(args.offset ?? 0);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;
    const sql = `
      SELECT id, ts, severity, category, source, title, description, src_ip, target_user, details, acknowledged
        FROM mp_security_events
       ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY ts DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    const res = await c.query(sql, params);
    return res.rows.map((r) => ({
      id: Number(r.id),
      ts: r.ts.toISOString(),
      severity: r.severity,
      category: r.category,
      source: r.source,
      title: r.title,
      description: r.description,
      srcIp: r.src_ip,
      targetUser: r.target_user,
      details: r.details,
      acknowledged: r.acknowledged,
    }));
  });
}

export async function dashboardStats(): Promise<{
  alertsLast24h: number;
  alertsLast7d: number;
  bySeverity: Record<Severity, number>;
  byCategory: Array<{ category: string; count: number }>;
  topSrcIps: Array<{ ip: string; count: number }>;
  blockedIps: number;
}> {
  return withClient(async (c) => {
    const [last24, last7, sev, cat, ips, blocked] = await Promise.all([
      c.query(
        `SELECT COUNT(*) FROM mp_security_events WHERE ts > now() - interval '24 hours'`,
      ),
      c.query(
        `SELECT COUNT(*) FROM mp_security_events WHERE ts > now() - interval '7 days'`,
      ),
      c.query(
        `SELECT severity, COUNT(*) FROM mp_security_events
          WHERE ts > now() - interval '7 days' GROUP BY severity`,
      ),
      c.query(
        `SELECT category, COUNT(*) AS count FROM mp_security_events
          WHERE ts > now() - interval '7 days' GROUP BY category ORDER BY count DESC LIMIT 8`,
      ),
      c.query(
        `SELECT src_ip AS ip, COUNT(*) AS count FROM mp_security_events
          WHERE src_ip IS NOT NULL AND ts > now() - interval '7 days'
          GROUP BY src_ip ORDER BY count DESC LIMIT 10`,
      ),
      c.query(`SELECT COUNT(*) FROM mp_blocked_ips`),
    ]);
    const bySeverity = { info: 0, low: 0, medium: 0, high: 0, critical: 0 } as Record<Severity, number>;
    for (const r of sev.rows) bySeverity[r.severity as Severity] = Number(r.count);
    return {
      alertsLast24h: Number(last24.rows[0].count),
      alertsLast7d: Number(last7.rows[0].count),
      bySeverity,
      byCategory: cat.rows.map((r) => ({ category: r.category, count: Number(r.count) })),
      topSrcIps: ips.rows.map((r) => ({ ip: r.ip, count: Number(r.count) })),
      blockedIps: Number(blocked.rows[0].count),
    };
  });
}
