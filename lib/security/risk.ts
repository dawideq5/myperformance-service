import { withClient } from "@/lib/db";
import { lookupIps, type GeoRow } from "@/lib/security/geoip";

export type RiskBand = "low" | "medium" | "high" | "critical";

export interface IpIntel {
  ip: string;
  blocked: boolean;
  blockedAt: string | null;
  blockedExpires: string | null;
  blockedReason: string | null;
  blockedSource: string | null;
  blockedBy: string | null;

  events: {
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    firstSeen: string | null;
    lastSeen: string | null;
    distinctUsers: string[];
    distinctSources: string[];
  };

  riskScore: number; // 0-100
  riskBand: RiskBand;
  riskReasons: string[];

  geo: GeoRow | null;
}

const SEVERITY_WEIGHT: Record<string, number> = {
  info: 0,
  low: 1,
  medium: 4,
  high: 12,
  critical: 25,
};

/**
 * Risk score 0-100 oparty o:
 * - sumę severity × weight (cap 50)
 * - rozpiętość czasową (>24h = persistent +5, >7d = +10)
 * - liczbę distinct user (>1 = brute force +10, >5 = credential stuffing +20)
 * - liczbę distinct categories (>3 = wieloaspektowy atak +10)
 * - off-hours score (zdarzenia 0-6 UTC = +5, jeśli >50% zdarzeń)
 * - geographic outlier (kraj inny niż PL/EU = +5)
 */
function scoreIp(args: {
  totalEvents: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  distinctUsers: number;
  spanHours: number;
  offHoursRatio: number;
  countryCode: string | null;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Severity points
  let sevScore = 0;
  for (const [sev, count] of Object.entries(args.bySeverity)) {
    sevScore += (SEVERITY_WEIGHT[sev] ?? 0) * count;
  }
  sevScore = Math.min(sevScore, 50);
  if (sevScore >= 25) reasons.push(`Wysokie severity (${sevScore}pkt)`);
  score += sevScore;

  // Distinct users → brute force pattern
  if (args.distinctUsers >= 5) {
    score += 20;
    reasons.push(`Atak na ${args.distinctUsers} kont (credential stuffing)`);
  } else if (args.distinctUsers >= 2) {
    score += 10;
    reasons.push(`Atak na ${args.distinctUsers} kont`);
  }

  // Span — persistence
  if (args.spanHours >= 168) {
    score += 10;
    reasons.push(`Aktywność >7 dni (persistent threat)`);
  } else if (args.spanHours >= 24) {
    score += 5;
    reasons.push(`Aktywność >24h`);
  }

  // Categories diversity
  const distinctCats = Object.keys(args.byCategory).length;
  if (distinctCats >= 4) {
    score += 10;
    reasons.push(`${distinctCats} różnych typów ataku`);
  } else if (distinctCats >= 2) {
    score += 3;
  }

  // Off-hours
  if (args.offHoursRatio > 0.5 && args.totalEvents >= 5) {
    score += 5;
    reasons.push(`Większość zdarzeń w godzinach nocnych`);
  }

  // Geographic — country outside PL/EU is mild signal (not strong, just hint)
  if (args.countryCode) {
    const friendly = ["PL", "DE", "FR", "NL", "ES", "IT", "GB", "BE", "AT", "CH"];
    if (!friendly.includes(args.countryCode)) {
      score += 3;
    }
  }

  return { score: Math.min(100, Math.round(score)), reasons };
}

function bandOf(score: number): RiskBand {
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

/**
 * Pełny intel po IP — łączy mp_blocked_ips z mp_security_events:
 * agregacja, distinct users, span, off-hours ratio, geo, risk score.
 */
export async function getIpIntel(args: {
  ips?: string[];
  search?: string;
  status?: "all" | "blocked" | "active";
  limit?: number;
}): Promise<IpIntel[]> {
  const search = args.search?.trim() ?? "";
  const status = args.status ?? "all";
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

  const rows = await withClient(async (c) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (args.ips && args.ips.length > 0) {
      params.push(args.ips);
      where.push(`ip = ANY($${params.length}::text[])`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(ip ILIKE $${params.length} OR reason ILIKE $${params.length} OR blocked_by ILIKE $${params.length})`,
      );
    }
    if (status === "blocked") {
      where.push(`(expires_at IS NULL OR expires_at > now())`);
    } else if (status === "active") {
      where.push(`expires_at IS NOT NULL AND expires_at <= now()`);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    // 1) Lista IP — z blocked_ips (jeśli zablokowane) UNION z security_events
    //    (jeśli nie zablokowane ale pojawia się w eventach).
    const ipsRes = await c.query<{ ip: string }>(
      search || args.ips
        ? `SELECT DISTINCT ip FROM (
             SELECT ip FROM mp_blocked_ips ${whereClause}
             UNION
             SELECT src_ip AS ip FROM mp_security_events
              WHERE src_ip IS NOT NULL
                ${search ? `AND (src_ip ILIKE $${params.length} OR title ILIKE $${params.length} OR target_user ILIKE $${params.length})` : ""}
                ${args.ips ? `AND src_ip = ANY($1::text[])` : ""}
           ) sub
           ORDER BY ip
           LIMIT ${limit}`
        : `SELECT DISTINCT ip FROM (
             SELECT ip FROM mp_blocked_ips
             UNION
             SELECT src_ip AS ip FROM mp_security_events
              WHERE src_ip IS NOT NULL
                AND ts > now() - interval '30 days'
           ) sub
           LIMIT ${limit}`,
      params,
    );
    const ips = ipsRes.rows.map((r) => r.ip);
    if (ips.length === 0) return [];

    // 2) Block info
    const blocksRes = await c.query<{
      ip: string;
      reason: string;
      blocked_at: Date;
      expires_at: Date | null;
      blocked_by: string;
      source: string;
    }>(
      `SELECT ip, reason, blocked_at, expires_at, blocked_by, source
         FROM mp_blocked_ips
        WHERE ip = ANY($1::text[])`,
      [ips],
    );
    const blockMap = new Map(blocksRes.rows.map((r) => [r.ip, r]));

    // 3) Eventy aggregated
    const eventsRes = await c.query<{
      ip: string;
      total: string;
      severity_counts: string; // jsonb_object_agg
      category_counts: string;
      distinct_users: string[];
      distinct_sources: string[];
      first_seen: Date;
      last_seen: Date;
      off_hours_count: string;
    }>(
      `SELECT
         src_ip AS ip,
         COUNT(*)::text AS total,
         (SELECT jsonb_object_agg(severity, c) FROM (
           SELECT severity, COUNT(*) AS c FROM mp_security_events e2
            WHERE e2.src_ip = e.src_ip
            GROUP BY severity
         ) s)::text AS severity_counts,
         (SELECT jsonb_object_agg(category, c) FROM (
           SELECT category, COUNT(*) AS c FROM mp_security_events e3
            WHERE e3.src_ip = e.src_ip
            GROUP BY category
            ORDER BY c DESC LIMIT 10
         ) k)::text AS category_counts,
         array_remove(array_agg(DISTINCT target_user), NULL) AS distinct_users,
         array_remove(array_agg(DISTINCT source), NULL) AS distinct_sources,
         MIN(ts) AS first_seen,
         MAX(ts) AS last_seen,
         COUNT(*) FILTER (
           WHERE EXTRACT(hour FROM ts) BETWEEN 0 AND 5
         )::text AS off_hours_count
       FROM mp_security_events e
       WHERE src_ip = ANY($1::text[])
       GROUP BY src_ip`,
      [ips],
    );

    return ips.map((ip) => {
      const block = blockMap.get(ip);
      const ev = eventsRes.rows.find((r) => r.ip === ip);
      const bySeverity: Record<string, number> = ev?.severity_counts
        ? JSON.parse(ev.severity_counts)
        : {};
      const byCategory: Record<string, number> = ev?.category_counts
        ? JSON.parse(ev.category_counts)
        : {};
      const total = ev ? parseInt(ev.total, 10) : 0;
      const distinctUsers = ev?.distinct_users ?? [];
      const distinctSources = ev?.distinct_sources ?? [];
      const firstSeen = ev?.first_seen?.toISOString() ?? null;
      const lastSeen = ev?.last_seen?.toISOString() ?? null;
      const spanHours =
        firstSeen && lastSeen
          ? (new Date(lastSeen).getTime() - new Date(firstSeen).getTime()) /
            3_600_000
          : 0;
      const offHoursCount = ev ? parseInt(ev.off_hours_count, 10) : 0;
      const offHoursRatio = total > 0 ? offHoursCount / total : 0;

      return {
        ip,
        block,
        events: {
          total,
          bySeverity,
          byCategory,
          firstSeen,
          lastSeen,
          distinctUsers,
          distinctSources,
        },
        spanHours,
        offHoursRatio,
      };
    });
  });

  // Geo lookup
  const geoMap = await lookupIps(rows.map((r) => r.ip)).catch(
    () => new Map<string, GeoRow>(),
  );

  return rows.map((r) => {
    const geo = geoMap.get(r.ip) ?? null;
    const { score, reasons } = scoreIp({
      totalEvents: r.events.total,
      bySeverity: r.events.bySeverity,
      byCategory: r.events.byCategory,
      distinctUsers: r.events.distinctUsers.length,
      spanHours: r.spanHours,
      offHoursRatio: r.offHoursRatio,
      countryCode: geo?.countryCode ?? null,
    });
    return {
      ip: r.ip,
      blocked: !!r.block,
      blockedAt: r.block?.blocked_at.toISOString() ?? null,
      blockedExpires: r.block?.expires_at?.toISOString() ?? null,
      blockedReason: r.block?.reason ?? null,
      blockedSource: r.block?.source ?? null,
      blockedBy: r.block?.blocked_by ?? null,
      events: r.events,
      riskScore: score,
      riskBand: bandOf(score),
      riskReasons: reasons,
      geo,
    } satisfies IpIntel;
  });
}
