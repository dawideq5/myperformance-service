export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  canAccessInfrastructure,
  canAccessKeycloakAdmin,
  hasArea,
} from "@/lib/admin-auth";
import { withClient } from "@/lib/db";
import { ApiError, createSuccessResponse, handleApiError } from "@/lib/api-utils";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { APP_CATALOG } from "@/lib/app-catalog";
import { listItems, isConfigured as directusConfigured } from "@/lib/directus-cms";
import type { Session } from "next-auth";

interface DirectusAppRow {
  id: string;
  tags?: string | string[] | null;
}

let tagsCache: { ts: number; map: Map<string, string[]> } | null = null;
const TAGS_CACHE_TTL_MS = 60_000;

async function getTagsFromDirectus(): Promise<Map<string, string[]>> {
  if (tagsCache && Date.now() - tagsCache.ts < TAGS_CACHE_TTL_MS) {
    return tagsCache.map;
  }
  const map = new Map<string, string[]>();
  try {
    if (!(await directusConfigured())) return map;
    const rows = await listItems<DirectusAppRow>("mp_app_catalog", { limit: 100 });
    for (const r of rows) {
      const raw = r.tags;
      if (!raw) continue;
      const arr = Array.isArray(raw)
        ? raw
        : String(raw)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      if (arr.length > 0) map.set(r.id, arr);
    }
  } catch {
    // Directus down → wracamy do hardcoded keywords
  }
  tagsCache = { ts: Date.now(), map };
  return map;
}

interface SearchHit {
  type: "user" | "ip" | "device" | "tile";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  meta?: string;
}

interface TileSpec {
  title: string;
  subtitle: string;
  href: string;
  keywords: string;
  /** Area required do zobaczenia tile w wynikach. null = każdy zalogowany. */
  requiresArea: string | null;
  /** Min priority dla area. */
  requiresMinPriority?: number;
}

/**
 * Pełny katalog kafelków + sub-views (deep links). Każdy ma `requiresArea`,
 * dzięki czemu palette pokazuje TYLKO funkcje do których user ma dostęp.
 */
const TILES: TileSpec[] = APP_CATALOG.map((c) => ({
  title: c.title,
  subtitle: c.subtitle,
  href: c.href,
  keywords: c.keywords,
  requiresArea: c.requiresArea,
  requiresMinPriority: c.requiresMinPriority,
}));

function tileVisible(session: Session | null, t: TileSpec): boolean {
  if (t.requiresArea === null) return true;
  return hasArea(session, t.requiresArea, { min: t.requiresMinPriority ?? 1 });
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    // Rate-limit: chroni przed scrape całej listy userów / IP przez palette.
    // 30 req/min/IP = wystarczy dla normal use, blokuje crawler.
    const ip = getClientIp(req);
    const userKey = session.user.id ?? session.user.email ?? "anon";
    const rl = rateLimit(`search:${userKey}:${ip}`, {
      capacity: 30,
      refillPerSec: 0.5,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Zbyt wiele wyszukań. Spróbuj za chwilę." } },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        },
      );
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
    const lower = q.toLowerCase();
    const hits: SearchHit[] = [];

    // Special: q="panel" lub puste → wszystkie widoczne kafelki (sugestia
    // przy otwartej palette zanim user zacznie pisać).
    if (q.length === 0 || lower === "panel" || lower === "panels") {
      for (const t of TILES) {
        if (!tileVisible(session, t)) continue;
        hits.push({
          type: "tile",
          id: t.href,
          title: t.title,
          subtitle: t.subtitle,
          href: t.href,
        });
      }
      return createSuccessResponse({ hits: hits.slice(0, limit) });
    }

    // 1) Tiles + sub-views — filtrowane po dostępie usera + tagi z Directus.
    const tagsMap = await getTagsFromDirectus();
    for (const t of TILES) {
      if (!tileVisible(session, t)) continue;
      const tags = tagsMap.get(t.href) ?? [];
      const tagsMatch = tags.some((tag) => tag.toLowerCase().includes(lower));
      if (
        t.title.toLowerCase().includes(lower) ||
        t.subtitle.toLowerCase().includes(lower) ||
        t.keywords.includes(lower) ||
        tagsMatch
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

    // 2) Privacy boundary: każdy typ wyniku ma własny gate uprawnień.
    // Wcześniej był canAccessAdminPanel (any admin role) — przez co np.
    // email-admin widział userów i IP, klikał, dostawał "Brak dostępu".
    const canSearchUsers = canAccessKeycloakAdmin(session);
    const canSearchInfra = canAccessInfrastructure(session);

    if (canSearchInfra) {
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
    }

    if (canSearchUsers && lower.length >= 2) {
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
        // ignore
      }
    }

    if (canSearchInfra && lower.length >= 4) {
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
