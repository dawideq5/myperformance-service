export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { canAccessAdminPanel, hasArea } from "@/lib/admin-auth";
import { withClient } from "@/lib/db";
import { ApiError, createSuccessResponse, handleApiError } from "@/lib/api-utils";
import type { Session } from "next-auth";

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
const TILES: TileSpec[] = [
  // === Główne panele admin ===
  {
    title: "Infrastruktura serwera",
    subtitle: "VPS, DNS, Zasoby, Bezpieczeństwo, Wazuh",
    href: "/admin/infrastructure",
    keywords: "vps dns snapshot resources cpu ram security wazuh siem",
    requiresArea: "infrastructure",
    requiresMinPriority: 90,
  },
  {
    title: "Email — centralne zarządzanie",
    subtitle: "Branding, KC templates, Postal, OVH",
    href: "/admin/email",
    keywords: "email branding template postal ovh smtp mail",
    requiresArea: "email-admin",
    requiresMinPriority: 90,
  },
  {
    title: "Użytkownicy",
    subtitle: "Lista, role, uprawnienia",
    href: "/admin/users",
    keywords: "users uzytkownicy konta role uprawnienia permissions kc keycloak",
    requiresArea: "keycloak",
    requiresMinPriority: 90,
  },
  {
    title: "Grupy",
    subtitle: "Persony — zestawy ról",
    href: "/admin/users?tab=groups",
    keywords: "grupy groups personas roles",
    requiresArea: "keycloak",
    requiresMinPriority: 90,
  },
  {
    title: "Certyfikaty klienckie",
    subtitle: "step-ca, mTLS, PKCS12",
    href: "/admin/certificates",
    keywords: "certyfikaty mtls step-ca pki client cert pkcs12",
    requiresArea: "certificates",
    requiresMinPriority: 90,
  },

  // === Sub-views w infrastructure ===
  {
    title: "VPS + Backup",
    subtitle: "Snapshoty, OVH, restore",
    href: "/admin/infrastructure?tab=vps",
    keywords: "vps backup snapshot ovh restore image",
    requiresArea: "infrastructure",
    requiresMinPriority: 90,
  },
  {
    title: "DNS Zone",
    subtitle: "Domeny, rekordy DNS",
    href: "/admin/infrastructure?tab=dns",
    keywords: "dns domain rekord zone",
    requiresArea: "infrastructure",
    requiresMinPriority: 90,
  },
  {
    title: "Zasoby (CPU/RAM/Disk)",
    subtitle: "Metryki + Docker stats",
    href: "/admin/infrastructure?tab=resources",
    keywords: "cpu ram disk docker zasoby metryki resources",
    requiresArea: "infrastructure",
    requiresMinPriority: 90,
  },
  {
    title: "Bezpieczeństwo / Alerty",
    subtitle: "Security events, severity, alert log",
    href: "/admin/infrastructure?tab=security",
    keywords: "alerty security events severity bezpieczenstwo",
    requiresArea: "infrastructure",
    requiresMinPriority: 90,
  },
  {
    title: "Threat Intel — IP",
    subtitle: "Blokady, risk score, geolokacja",
    href: "/admin/infrastructure?tab=blocks",
    keywords: "ip block threat blocked iptables wazuh risk score blocks",
    requiresArea: "infrastructure",
    requiresMinPriority: 90,
  },
  {
    title: "Mapa zdarzeń",
    subtitle: "Geo + timeline + correlations",
    href: "/admin/infrastructure?tab=map",
    keywords: "map mapa events timeline correlations attack geo",
    requiresArea: "infrastructure",
    requiresMinPriority: 90,
  },
  {
    title: "Urządzenia",
    subtitle: "Device fingerprinting, sightings",
    href: "/admin/infrastructure?tab=devices",
    keywords: "devices urzadzenia fingerprint cookie",
    requiresArea: "infrastructure",
    requiresMinPriority: 90,
  },
  {
    title: "Wazuh SIEM",
    subtitle: "Agenty, reguły, AR",
    href: "/admin/infrastructure?tab=wazuh",
    keywords: "wazuh siem agent rule active response",
    requiresArea: "wazuh",
    requiresMinPriority: 90,
  },

  // === Sub-views w /admin/email ===
  {
    title: "Szablony emaili",
    subtitle: "Edytor + preview + włącz/wyłącz",
    href: "/admin/email?tab=templates",
    keywords: "szablony templates email mail kc keycloak",
    requiresArea: "email-admin",
    requiresMinPriority: 90,
  },
  {
    title: "Branding emaili",
    subtitle: "Logo, accent, footer",
    href: "/admin/email?tab=branding",
    keywords: "branding logo kolor footer mail email",
    requiresArea: "email-admin",
    requiresMinPriority: 90,
  },
  {
    title: "Konfiguracje SMTP",
    subtitle: "Aliasy, transactional/marketing",
    href: "/admin/email?tab=smtp",
    keywords: "smtp konfig email transactional marketing",
    requiresArea: "email-admin",
    requiresMinPriority: 90,
  },
  {
    title: "Postal (infrastruktura)",
    subtitle: "Organizacje, serwery, domeny",
    href: "/admin/email?tab=postal",
    keywords: "postal mail server organization domain dkim",
    requiresArea: "postal",
    requiresMinPriority: 90,
  },

  // === Konto (każdy user) ===
  {
    title: "Profil",
    subtitle: "Imię, nazwisko, email",
    href: "/account",
    keywords: "profil profile imie nazwisko email konto account",
    requiresArea: null,
  },
  {
    title: "Bezpieczeństwo (2FA, hasło)",
    subtitle: "TOTP + WebAuthn + zmiana hasła",
    href: "/account?tab=security",
    keywords: "bezpieczenstwo 2fa totp webauthn haslo password security",
    requiresArea: null,
  },
  {
    title: "Aktywne sesje",
    subtitle: "Lista urządzeń + wyloguj",
    href: "/account?tab=sessions",
    keywords: "sesje sessions urzadzenia wyloguj logout",
    requiresArea: null,
  },
  {
    title: "Integracje",
    subtitle: "Google, Kadromierz, Akademia",
    href: "/account?tab=integrations",
    keywords: "integracje integrations google kadromierz moodle akademia",
    requiresArea: null,
  },
  {
    title: "Logi aktywności",
    subtitle: "Audit-trail Twojego konta",
    href: "/account?tab=activity",
    keywords: "logi log activity aktywnosc audit",
    requiresArea: null,
  },
  {
    title: "Preferencje",
    subtitle: "Wskazówki + powiadomienia",
    href: "/account?tab=preferences",
    keywords: "preferencje preferences wskazowki hints powiadomienia notifications",
    requiresArea: null,
  },

  // === Aplikacje (na podstawie areas) ===
  {
    title: "Kalendarz",
    subtitle: "Twoje wydarzenia + integracje",
    href: "/dashboard/calendar",
    keywords: "kalendarz calendar wydarzenia events google moodle",
    requiresArea: null,
  },
  {
    title: "Dokumenty (Documenso)",
    subtitle: "Podpisy elektroniczne",
    href: "/api/documenso/sso",
    keywords: "dokumenty documents documenso podpis signature",
    requiresArea: "documenso",
    requiresMinPriority: 10,
  },
  {
    title: "Dokumenty — obieg organizacji",
    subtitle: "Status, podpisy, wysyłka",
    href: "/dashboard/documents-handler",
    keywords: "dokumenty obieg organizacja handler documenso",
    requiresArea: "documenso",
    requiresMinPriority: 50,
  },
  {
    title: "Akademia (Moodle)",
    subtitle: "Kursy, szkolenia, oceny",
    href: "/api/moodle/launch",
    keywords: "akademia moodle kursy courses szkolenia",
    requiresArea: "moodle",
    requiresMinPriority: 10,
  },
  {
    title: "Chatwoot",
    subtitle: "Live-chat z klientami",
    href: "/api/chatwoot/sso",
    keywords: "chatwoot chat live customer support",
    requiresArea: "chatwoot",
    requiresMinPriority: 10,
  },
  {
    title: "Baza wiedzy (Outline)",
    subtitle: "Procedury, how-to",
    href: "/api/outline/launch",
    keywords: "baza wiedzy outline knowledge procedury how-to wiki",
    requiresArea: "knowledge",
    requiresMinPriority: 10,
  },
  {
    title: "Directus CMS",
    subtitle: "Zarządzanie treścią",
    href: "/api/directus/launch",
    keywords: "directus cms tresc content collections",
    requiresArea: "directus",
    requiresMinPriority: 10,
  },
  {
    title: "Postal — admin",
    subtitle: "Native UI Postal",
    href: "https://postal.myperformance.pl",
    keywords: "postal admin email server native",
    requiresArea: "postal",
    requiresMinPriority: 90,
  },
  {
    title: "Keycloak admin",
    subtitle: "Realm, klienci, IdP",
    href: "/admin/keycloak",
    keywords: "keycloak idp realm clients admin console",
    requiresArea: "keycloak",
    requiresMinPriority: 90,
  },
];

function tileVisible(session: Session | null, t: TileSpec): boolean {
  if (t.requiresArea === null) return true;
  return hasArea(session, t.requiresArea, { min: t.requiresMinPriority ?? 1 });
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 1) return createSuccessResponse({ hits: [] });

    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
    const lower = q.toLowerCase();
    const hits: SearchHit[] = [];

    // 1) Tiles + sub-views — filtrowane po dostępie usera.
    for (const t of TILES) {
      if (!tileVisible(session, t)) continue;
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

    // 2) IP / user / device search — TYLKO admini (privacy boundary).
    const isAdmin = canAccessAdminPanel(session);

    if (isAdmin) {
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
          // ignore
        }
      }

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
    }

    return createSuccessResponse({ hits: hits.slice(0, limit) });
  } catch (error) {
    return handleApiError(error);
  }
}
