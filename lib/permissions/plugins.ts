/**
 * Integration plugin manifest — declarative SoT dla wszystkich integracji
 * (apk natywnych) systemu MyPerformance. Pozwala na auto-discovery:
 *
 *   - który webhook jest legalny (`/api/webhooks/<kind>` — porównujemy
 *     `kind` vs `webhookKind` w manifeście),
 *   - który tile pokazać (przez `dashboardTileId` → lookup w `tiles.ts`),
 *   - który provider obsłużyć (przez `providerId` → `PROVIDER_REGISTRY`),
 *   - który area mapować (przez `areaId` → `AREAS`).
 *
 * Wave 1 (Faza 4 część 1): manifest jako data + helpery `getPlugin*`.
 * Wave 2: walidacja webhook handlerów per `webhookKind`, ekstrakcja URL'i
 * publicznych do panel "Status integracji".
 *
 * Konwencje:
 *  - `id` jest stabilne i = `nativeProviderId`/`areaId` gdy plugin to
 *    natywna app z RBAC (`directus`, `documenso`, `moodle` …),
 *  - `id` może być inne niż area gdy plugin to "side service" bez RBAC
 *    (np. `wazuh`, `step-ca`, `kadromierz`).
 */

import { getOptionalEnv } from "@/lib/env";

export interface IntegrationPlugin {
  /** Stabilne id (snake-case lub kebab-case). */
  id: string;
  /** PL label do UI. */
  label: string;
  /**
   * id z `PROVIDER_REGISTRY` — gdy plugin ma natywny RBAC. Optional dla
   * apk bez ról (Kadromierz to klient OAuth2, nie ma RBAC po naszej
   * stronie).
   */
  providerId?: string;
  /** id z `AREAS` — gdy plugin gates dostęp przez area. */
  areaId?: string;
  /** Nazwa ikony z `lucide-react`. */
  iconName: string;
  /**
   * Public URL aplikacji (z env). Funkcja zwraca pusty string gdy env
   * nie ustawione — caller decyduje czy fallback'ować.
   */
  publicUrl?: () => string;
  /** id tile'a w `DASHBOARD_TILES` (gdy plugin ma kafelek na dashboard). */
  dashboardTileId?: string;
  /**
   * Webhook kind — używane w `/api/webhooks/<kind>`. Gdy plugin nie wysyła
   * webhooków (Directus admin-token only), zostaw undefined.
   */
  webhookKind?: string;
  /** Krótki opis (PL) — pokazywany w panelu "Status integracji". */
  description?: string;
}

export const INTEGRATION_PLUGINS: IntegrationPlugin[] = [
  {
    id: "directus",
    label: "Directus CMS",
    providerId: "directus",
    areaId: "directus",
    iconName: "Database",
    publicUrl: () =>
      (getOptionalEnv("DIRECTUS_URL") || "https://cms.myperformance.pl").replace(
        /\/$/,
        "",
      ),
    dashboardTileId: "directus",
    description:
      "Headless CMS — kolekcje danych, treści, content modeling, custom flows.",
  },
  {
    id: "documenso",
    label: "Documenso",
    providerId: "documenso",
    areaId: "documenso",
    iconName: "FileSignature",
    publicUrl: () =>
      (getOptionalEnv("DOCUMENSO_PUBLIC_URL") || "https://sign.myperformance.pl").replace(
        /\/$/,
        "",
      ),
    dashboardTileId: "documenso",
    webhookKind: "documenso",
    description: "E-podpis i obieg dokumentów (PDF, szablony, status, webhooki).",
  },
  {
    id: "moodle",
    label: "MyPerformance — Akademia (Moodle)",
    providerId: "moodle",
    areaId: "moodle",
    iconName: "GraduationCap",
    publicUrl: () =>
      (getOptionalEnv("MOODLE_URL") || "https://moodle.myperformance.pl").replace(
        /\/$/,
        "",
      ),
    dashboardTileId: "moodle",
    webhookKind: "moodle",
    description:
      "LMS — szkolenia, kursy, certyfikaty (custom roles, dynamic-roles sync).",
  },
  {
    id: "chatwoot",
    label: "Chatwoot",
    providerId: "chatwoot",
    areaId: "chatwoot",
    iconName: "MessageSquare",
    publicUrl: () =>
      (getOptionalEnv("CHATWOOT_PUBLIC_URL") || "https://chat.myperformance.pl").replace(
        /\/$/,
        "",
      ),
    dashboardTileId: "chatwoot",
    webhookKind: "chatwoot",
    description: "Live-chat z klientami — omnichannel inbox, automatyzacje, agenty.",
  },
  {
    id: "outline",
    label: "Outline (baza wiedzy)",
    providerId: "outline",
    areaId: "knowledge",
    iconName: "BookMarked",
    publicUrl: () =>
      (getOptionalEnv("OUTLINE_URL") || "https://knowledge.myperformance.pl").replace(
        /\/$/,
        "",
      ),
    dashboardTileId: "knowledge",
    webhookKind: "outline",
    description: "Wewnętrzna wiki — procedury, zasady, how-to (Outline native).",
  },
  {
    id: "postal",
    label: "Postal",
    providerId: "postal",
    areaId: "postal",
    iconName: "Mail",
    publicUrl: () =>
      (getOptionalEnv("POSTAL_PUBLIC_URL") || "https://postal.myperformance.pl").replace(
        /\/$/,
        "",
      ),
    dashboardTileId: "postal",
    description: "Mailowy MTA — transactional + newsletters, DKIM/SPF, webhooks.",
  },
  // ─── Side services (no RBAC providerId) ────────────────────────────────
  {
    id: "keycloak",
    label: "Keycloak (IdP)",
    areaId: "keycloak",
    iconName: "KeyRound",
    publicUrl: () =>
      (getOptionalEnv("KEYCLOAK_PUBLIC_URL") || "https://auth.myperformance.pl").replace(
        /\/$/,
        "",
      ),
    dashboardTileId: "keycloak",
    webhookKind: "keycloak",
    description: "Source of truth dla tożsamości — realm, role, klienci, IdP federation.",
  },
  {
    id: "kadromierz",
    label: "Kadromierz",
    areaId: "kadromierz",
    iconName: "Clock",
    publicUrl: () => getOptionalEnv("KADROMIERZ_PUBLIC_URL"),
    dashboardTileId: "kadromierz",
    description: "Grafik pracy + ewidencja czasu (per-user OAuth2, brak RBAC po naszej stronie).",
  },
  {
    id: "wazuh",
    label: "Wazuh SIEM",
    areaId: "infrastructure",
    iconName: "ShieldCheck",
    publicUrl: () =>
      (getOptionalEnv("WAZUH_PUBLIC_URL") || "https://wazuh.myperformance.pl").replace(
        /\/$/,
        "",
      ),
    webhookKind: "wazuh",
    description:
      "SIEM — agenty, reguły detekcji, Active Response (Webhook→iptables blocklist).",
  },
  {
    id: "step-ca",
    label: "step-ca",
    areaId: "stepca",
    iconName: "Shield",
    publicUrl: () => getOptionalEnv("STEPCA_URL"),
    description: "PKI — wydawanie certyfikatów mTLS dla cert-gated paneli.",
  },
];

/**
 * Lookup po id. Returns null gdy nie ma takiego pluginu.
 */
export function getPlugin(id: string): IntegrationPlugin | null {
  return INTEGRATION_PLUGINS.find((p) => p.id === id) ?? null;
}

/**
 * Lookup po `webhookKind` — używane przez router `/api/webhooks/[kind]/...`
 * do walidacji "czy ten webhook jest legalny?".
 */
export function getPluginByWebhookKind(kind: string): IntegrationPlugin | null {
  return INTEGRATION_PLUGINS.find((p) => p.webhookKind === kind) ?? null;
}

/**
 * Lookup po `providerId` — używane przez panel diagnostyczny żeby zmapować
 * provider z `PROVIDER_REGISTRY` do meta-info (URL, ikona, label).
 */
export function getPluginByProviderId(providerId: string): IntegrationPlugin | null {
  return INTEGRATION_PLUGINS.find((p) => p.providerId === providerId) ?? null;
}

/**
 * Lookup po `areaId` — używane gdy mamy area z `AREAS` i chcemy znaleźć
 * powiązaną integrację (np. dla URL'a do natywnego UI).
 */
export function getPluginByAreaId(areaId: string): IntegrationPlugin | null {
  return INTEGRATION_PLUGINS.find((p) => p.areaId === areaId) ?? null;
}

/**
 * Lista pluginów które mają provider w PROVIDER_REGISTRY (czyli RBAC sync
 * po naszej stronie).
 */
export function listPluginsWithProvider(): IntegrationPlugin[] {
  return INTEGRATION_PLUGINS.filter((p) => !!p.providerId);
}
