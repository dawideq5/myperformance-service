export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import { withClient } from "@/lib/db";
import { lookupIps } from "@/lib/security/geoip";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

interface CountryAgg {
  countryCode: string;
  country: string;
  events: number;
  highSeverity: number; // high+critical count
  uniqueIps: number;
  uniqueUsers: number;
}

interface TimelineBucket {
  hour: string; // ISO hour bucket
  total: number;
  bySeverity: Record<string, number>;
}

interface MarkerPoint {
  ip: string;
  lat: number;
  lng: number;
  country: string | null;
  city: string | null;
  events: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
}

interface CorrelationFinding {
  type:
    | "credential_stuffing" // 1 IP → wielu users
    | "compromised_account" // 1 user → wiele IP
    | "distributed_attack"; // wiele IP w krótkim czasie z tego samego ASN
  description: string;
  severity: "medium" | "high" | "critical";
  evidence: Record<string, unknown>;
}

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function highestSeverity(
  rows: Array<{ severity: string }>,
): "info" | "low" | "medium" | "high" | "critical" {
  let best: keyof typeof SEVERITY_RANK = "info";
  for (const r of rows) {
    if ((SEVERITY_RANK[r.severity] ?? 0) > SEVERITY_RANK[best]) {
      best = r.severity as keyof typeof SEVERITY_RANK;
    }
  }
  return best as "info" | "low" | "medium" | "high" | "critical";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);

    const url = new URL(req.url);
    const hours = parseInt(url.searchParams.get("hours") ?? "168", 10);
    const since = `now() - interval '${Math.min(Math.max(hours, 1), 720)} hours'`;

    const data = await withClient(async (c) => {
      // 1) Per-IP eventy w okresie + ich severity
      const ipRes = await c.query<{
        ip: string;
        events: string;
        max_severity: string;
      }>(
        `SELECT
           src_ip AS ip,
           COUNT(*)::text AS events,
           MAX(severity) AS max_severity
         FROM mp_security_events
         WHERE src_ip IS NOT NULL AND ts > ${since}
         GROUP BY src_ip
         ORDER BY COUNT(*) DESC
         LIMIT 200`,
      );

      // 2) Timeline po godzinie
      const timelineRes = await c.query<{
        bucket: Date;
        severity: string;
        count: string;
      }>(
        `SELECT
           date_trunc('hour', ts) AS bucket,
           severity,
           COUNT(*)::text AS count
         FROM mp_security_events
         WHERE ts > ${since}
         GROUP BY date_trunc('hour', ts), severity
         ORDER BY bucket ASC`,
      );

      // 3) Wszystkie userzy → IP mapping (do correlation)
      const userIpRes = await c.query<{
        target_user: string;
        ip_count: string;
      }>(
        `SELECT target_user, COUNT(DISTINCT src_ip)::text AS ip_count
         FROM mp_security_events
         WHERE target_user IS NOT NULL
           AND src_ip IS NOT NULL
           AND ts > ${since}
         GROUP BY target_user
         HAVING COUNT(DISTINCT src_ip) >= 3
         ORDER BY COUNT(DISTINCT src_ip) DESC
         LIMIT 20`,
      );

      // 4) IP → users mapping (credential stuffing)
      const ipUsersRes = await c.query<{
        src_ip: string;
        user_count: string;
        users: string[];
      }>(
        `SELECT src_ip, COUNT(DISTINCT target_user)::text AS user_count,
                array_agg(DISTINCT target_user) FILTER (WHERE target_user IS NOT NULL) AS users
         FROM mp_security_events
         WHERE src_ip IS NOT NULL AND target_user IS NOT NULL
           AND ts > ${since}
         GROUP BY src_ip
         HAVING COUNT(DISTINCT target_user) >= 3
         ORDER BY COUNT(DISTINCT target_user) DESC
         LIMIT 20`,
      );

      return { ipRes, timelineRes, userIpRes, ipUsersRes };
    });

    // 5) Geo lookup
    const allIps = data.ipRes.rows.map((r) => r.ip);
    const geoMap = await lookupIps(allIps).catch(() => new Map());

    // Aggregacja per kraj
    const countryMap = new Map<string, CountryAgg>();
    const markers: MarkerPoint[] = [];
    let totalEvents = 0;
    let highSevTotal = 0;
    for (const r of data.ipRes.rows) {
      const events = parseInt(r.events, 10);
      totalEvents += events;
      const isHigh = r.max_severity === "high" || r.max_severity === "critical";
      if (isHigh) highSevTotal += events;
      const geo = geoMap.get(r.ip);
      if (geo?.countryCode) {
        const cur = countryMap.get(geo.countryCode) ?? {
          countryCode: geo.countryCode,
          country: geo.country ?? geo.countryCode,
          events: 0,
          highSeverity: 0,
          uniqueIps: 0,
          uniqueUsers: 0,
        };
        cur.events += events;
        if (isHigh) cur.highSeverity += events;
        cur.uniqueIps += 1;
        countryMap.set(geo.countryCode, cur);
      }
      if (geo?.lat != null && geo?.lng != null) {
        markers.push({
          ip: r.ip,
          lat: geo.lat,
          lng: geo.lng,
          country: geo.country,
          city: geo.city,
          events,
          severity: r.max_severity as MarkerPoint["severity"],
        });
      }
    }
    const countries = Array.from(countryMap.values()).sort(
      (a, b) => b.events - a.events,
    );

    // Timeline buckets
    const bucketMap = new Map<string, TimelineBucket>();
    for (const r of data.timelineRes.rows) {
      const key = r.bucket.toISOString();
      const cur = bucketMap.get(key) ?? {
        hour: key,
        total: 0,
        bySeverity: {},
      };
      const c = parseInt(r.count, 10);
      cur.total += c;
      cur.bySeverity[r.severity] = (cur.bySeverity[r.severity] ?? 0) + c;
      bucketMap.set(key, cur);
    }
    const timeline = Array.from(bucketMap.values()).sort((a, b) =>
      a.hour < b.hour ? -1 : 1,
    );

    // Correlations
    const correlations: CorrelationFinding[] = [];

    for (const r of data.ipUsersRes.rows) {
      const userCount = parseInt(r.user_count, 10);
      correlations.push({
        type: "credential_stuffing",
        description: `IP ${r.src_ip} próbował dostępu do ${userCount} kont (${(r.users ?? []).slice(0, 5).join(", ")}${userCount > 5 ? "…" : ""})`,
        severity: userCount >= 10 ? "critical" : userCount >= 5 ? "high" : "medium",
        evidence: { ip: r.src_ip, users: r.users, userCount },
      });
    }
    for (const r of data.userIpRes.rows) {
      const ipCount = parseInt(r.ip_count, 10);
      correlations.push({
        type: "compromised_account",
        description: `User ${r.target_user} pojawił się z ${ipCount} różnych IP`,
        severity: ipCount >= 10 ? "critical" : ipCount >= 5 ? "high" : "medium",
        evidence: { user: r.target_user, ipCount },
      });
    }

    correlations.sort(
      (a, b) =>
        (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
    );

    return createSuccessResponse({
      windowHours: hours,
      summary: {
        totalEvents,
        highSeverityEvents: highSevTotal,
        uniqueIps: allIps.length,
        countries: countries.length,
      },
      countries,
      markers,
      timeline,
      correlations: correlations.slice(0, 30),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
