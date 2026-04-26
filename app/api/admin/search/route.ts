export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { canAccessAdminPanel } from "@/lib/admin-auth";
import { withClient } from "@/lib/db";
import { ApiError, createSuccessResponse, handleApiError } from "@/lib/api-utils";

interface SearchHit {
  type: "user" | "ip" | "device" | "tile";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  meta?: string;
}

const TILES: Array<{ title: string; subtitle: string; href: string; keywords: string }> = [
  {
    title: "Infrastruktura serwera",
    subtitle: "VPS, DNS, Zasoby, Bezpieczeństwo, Wazuh",
    href: "/admin/infrastructure",
    keywords: "vps dns snapshot resources cpu ram security wazuh siem map blocks devices",
  },
  {
    title: "Email — centralne zarządzanie",
    subtitle: "Branding, KC templates, Postal, OVH",
    href: "/admin/email",
    keywords: "email branding template postal ovh smtp mail",
  },
  {
    title: "Użytkownicy",
    subtitle: "Lista, role, uprawnienia",
    href: "/admin/users",
    keywords: "users uzytkownicy konta role uprawnienia permissions",
  },
  {
    title: "Certyfikaty klienckie",
    subtitle: "step-ca, mTLS",
    href: "/admin/certificates",
    keywords: "certyfikaty mtls step-ca pki client cert",
  },
  {
    title: "Threat Intel — IP",
    subtitle: "Blokady, risk score, geolokacja",
    href: "/admin/infrastructure?tab=blocks",
    keywords: "ip block threat blocked iptables wazuh risk score",
  },
  {
    title: "Mapa zdarzeń",
    subtitle: "Geo + timeline + correlations",
    href: "/admin/infrastructure?tab=map",
    keywords: "map mapa events timeline correlations attack",
  },
  {
    title: "Urządzenia",
    subtitle: "Device fingerprinting, sightings",
    href: "/admin/infrastructure?tab=devices",
    keywords: "devices urzadzenia fingerprint cookie",
  },
];

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    if (!canAccessAdminPanel(session)) throw ApiError.forbidden();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 1) return createSuccessResponse({ hits: [] });

    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
    const lower = q.toLowerCase();

    const hits: SearchHit[] = [];

    // 1) Tiles (instant fuzzy match)
    for (const t of TILES) {
      if (
        t.title.toLowerCase().includes(lower) ||
        t.subtitle.toLowerCase().includes(lower) ||
        t.keywords.includes(lower)
      ) {
        hits.push({
          type: "tile",
          id: t.href,
          title: t.title,
          subtitle: t.subtitle,
          href: t.href,
        });
      }
    }

    // 2) IP — szybki match z mp_blocked_ips + mp_security_events.src_ip + mp_device_sightings.ip
    const looksLikeIp = /^[\d.:]+$/.test(q);
    if (looksLikeIp || lower.length >= 3) {
      const ipRows = await withClient(async (c) => {
        const r = await c.query<{ ip: string; events: string; blocked: boolean }>(
          `SELECT ip,
                  COUNT(*)::text AS events,
                  EXISTS(SELECT 1 FROM mp_blocked_ips b
                          WHERE b.ip = src.ip
                            AND (b.expires_at IS NULL OR b.expires_at > now())) AS blocked
             FROM (
               SELECT src_ip AS ip FROM mp_security_events
                 WHERE src_ip IS NOT NULL AND src_ip ILIKE $1
               UNION
               SELECT ip FROM mp_blocked_ips WHERE ip ILIKE $1
             ) src
            GROUP BY src.ip
            ORDER BY COUNT(*) DESC
            LIMIT $2`,
          [`%${q}%`, limit],
        );
        return r.rows;
      }).catch(() => []);
      for (const r of ipRows) {
        hits.push({
          type: "ip",
          id: r.ip,
          title: r.ip,
          subtitle: r.blocked ? "Zablokowany" : `${r.events} zdarzeń`,
          href: `/admin/infrastructure?tab=blocks&search=${encodeURIComponent(r.ip)}`,
          meta: r.blocked ? "blocked" : undefined,
        });
      }
    }

    // 3) User — przez KC search (email, username, firstName, lastName)
    if (lower.length >= 2) {
      try {
        const token = await keycloak.getServiceAccountToken();
        const res = await keycloak.adminRequest(
          `/users?search=${encodeURIComponent(q)}&max=${Math.min(limit, 10)}`,
          token,
        );
        if (res.ok) {
          const users = (await res.json()) as Array<{
            id: string;
            username?: string;
            email?: string;
            firstName?: string;
            lastName?: string;
          }>;
          for (const u of users) {
            const name =
              [u.firstName, u.lastName].filter(Boolean).join(" ") ||
              u.username ||
              u.email ||
              u.id;
            hits.push({
              type: "user",
              id: u.id,
              title: name,
              subtitle: u.email ?? u.username ?? "",
              href: `/admin/users/${u.id}`,
            });
          }
        }
      } catch {
        // ignore — KC down albo not granted
      }
    }

    // 4) Device — częściowy match po device_id prefix
    if (lower.length >= 4) {
      const devRows = await withClient(async (c) => {
        const r = await c.query<{
          device_id: string;
          user_email: string | null;
          last_seen: Date;
        }>(
          `SELECT s.device_id::text,
                  (array_agg(DISTINCT s.user_email) FILTER (WHERE s.user_email IS NOT NULL))[1] AS user_email,
                  MAX(s.seen_at) AS last_seen
             FROM mp_device_sightings s
            WHERE s.device_id::text ILIKE $1
            GROUP BY s.device_id
            ORDER BY MAX(s.seen_at) DESC
            LIMIT $2`,
          [`%${q}%`, 5],
        );
        return r.rows;
      }).catch(() => []);
      for (const r of devRows) {
        hits.push({
          type: "device",
          id: r.device_id,
          title: `Urządzenie ${r.device_id.slice(0, 8)}…${r.device_id.slice(-4)}`,
          subtitle: r.user_email ?? "anonimowe",
          href: `/admin/infrastructure?tab=devices&id=${r.device_id}`,
        });
      }
    }

    return createSuccessResponse({ hits: hits.slice(0, limit) });
  } catch (error) {
    return handleApiError(error);
  }
}
