export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import { withClient } from "@/lib/db";
import { getOptionalEnv } from "@/lib/env";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

interface WazuhStatus {
  deployed: boolean;
  dashboardUrl: string;
  oidcLoginUrl: string;
  integration: {
    arWebhook: boolean;
    iptablesSync: boolean;
  };
  events24h: {
    total: number;
    bySeverity: Record<string, number>;
    autoBlocks: number;
    uniqueSrcIps: number;
  };
  recentEvents: Array<{
    id: number;
    ts: string;
    severity: string;
    category: string;
    title: string;
    srcIp: string | null;
  }>;
  topSrcIps: Array<{ ip: string; count: number; blocked: boolean }>;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);

    return await withClient(async (c) => {
      const ev24h = await c.query<{ severity: string; count: string }>(
        `SELECT severity, COUNT(*)::text AS count
           FROM mp_security_events
          WHERE source = 'wazuh' AND ts > now() - interval '24 hours'
          GROUP BY severity`,
      );
      const bySeverity: Record<string, number> = {};
      let total = 0;
      for (const r of ev24h.rows) {
        const n = Number(r.count);
        bySeverity[r.severity] = n;
        total += n;
      }

      const blocks24h = await c.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM mp_blocked_ips
          WHERE source = 'wazuh-active-response'
            AND blocked_at > now() - interval '24 hours'`,
      );
      const autoBlocks = Number(blocks24h.rows[0]?.count ?? 0);

      const uniqIps = await c.query<{ count: string }>(
        `SELECT COUNT(DISTINCT src_ip)::text AS count
           FROM mp_security_events
          WHERE source = 'wazuh' AND ts > now() - interval '24 hours'
            AND src_ip IS NOT NULL`,
      );
      const uniqueSrcIps = Number(uniqIps.rows[0]?.count ?? 0);

      const recent = await c.query<{
        id: string; ts: Date; severity: string; category: string;
        title: string; src_ip: string | null;
      }>(
        `SELECT id, ts, severity, category, title, src_ip
           FROM mp_security_events
          WHERE source = 'wazuh'
          ORDER BY ts DESC
          LIMIT 15`,
      );
      const recentEvents = recent.rows.map((r) => ({
        id: Number(r.id),
        ts: r.ts.toISOString(),
        severity: r.severity,
        category: r.category,
        title: r.title,
        srcIp: r.src_ip,
      }));

      const top = await c.query<{ ip: string; cnt: string; blocked: boolean }>(
        `SELECT e.src_ip AS ip, COUNT(*)::text AS cnt,
                EXISTS(SELECT 1 FROM mp_blocked_ips b
                        WHERE b.ip = e.src_ip
                          AND (b.expires_at IS NULL OR b.expires_at > now())) AS blocked
           FROM mp_security_events e
          WHERE e.source = 'wazuh' AND e.ts > now() - interval '24 hours'
            AND e.src_ip IS NOT NULL
          GROUP BY e.src_ip
          ORDER BY COUNT(*) DESC
          LIMIT 10`,
      );
      const topSrcIps = top.rows.map((r) => ({
        ip: r.ip,
        count: Number(r.cnt),
        blocked: r.blocked,
      }));

      const arWebhook = !!getOptionalEnv("WAZUH_AR_SECRET").trim();
      const wazuhUrl = getOptionalEnv("NEXT_PUBLIC_WAZUH_URL");
      if (!wazuhUrl) {
        throw new Error(
          "NEXT_PUBLIC_WAZUH_URL not configured — Wazuh status panel disabled",
        );
      }
      const wazuhBase = wazuhUrl.replace(/\/$/, "");

      const status: WazuhStatus = {
        deployed: true,
        dashboardUrl: wazuhBase,
        oidcLoginUrl: `${wazuhBase}/auth/openid/login`,
        integration: {
          arWebhook,
          iptablesSync: true,
        },
        events24h: { total, bySeverity, autoBlocks, uniqueSrcIps },
        recentEvents,
        topSrcIps,
      };
      return createSuccessResponse(status);
    });
  } catch (error) {
    return handleApiError(error);
  }
}
