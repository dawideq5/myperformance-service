import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "directus-cms" });

/**
 * Directus CMS sync layer. Dashboard pozostaje canonical SoT dla mp_branding
 * i mp_email_templates — Directus dostaje read-only mirror, żeby contentowy
 * zespół widział aktualne wartości w UI Directusa (np. do wglądu lub
 * referencji w innych collectionach).
 *
 * Sync jest jednokierunkowy (push z dashboardu). Edycja w Directusie
 * zostanie nadpisana przy kolejnym sync — to celowe, bo źródło to mp_*.
 */

interface DirectusConfig {
  baseUrl: string;
  token: string;
}

function getConfig(): DirectusConfig | null {
  const baseUrl =
    getOptionalEnv("DIRECTUS_URL") || getOptionalEnv("DIRECTUS_INTERNAL_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function directusFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Directus is not configured (DIRECTUS_URL + DIRECTUS_ADMIN_TOKEN required)");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Directus ${init.method ?? "GET"} ${path} → ${res.status} ${body.slice(0, 200)}`,
    );
  }
  if (res.status === 204) return null as T;
  const data = (await res.json()) as { data?: T };
  return (data.data ?? data) as T;
}

interface CollectionSpec {
  collection: string;
  meta?: {
    icon?: string;
    note?: string;
    display_template?: string;
    singleton?: boolean;
  };
  schema?: Record<string, unknown>;
  fields?: Array<{
    field: string;
    type: string;
    schema?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }>;
}

export async function isConfigured(): Promise<boolean> {
  return getConfig() !== null;
}

/**
 * Tworzy collection w Directusie jeśli nie istnieje. Idempotent.
 */
export async function ensureCollection(spec: CollectionSpec): Promise<void> {
  try {
    await directusFetch(`/collections/${spec.collection}`);
    return; // exists
  } catch {
    // not found — create
  }
  await directusFetch(`/collections`, {
    method: "POST",
    body: JSON.stringify({
      collection: spec.collection,
      meta: {
        icon: "settings",
        note: "Read-only mirror z dashboard MyPerformance — edytuj w /admin/email",
        ...(spec.meta ?? {}),
      },
      schema: spec.schema ?? {},
      fields: spec.fields ?? [],
    }),
  });
  logger.info("Directus collection created", { collection: spec.collection });
}

/**
 * Upsert (update lub insert) pojedynczego itemu po kluczu primary.
 *
 * Directus quirk: PATCH na non-existent item zwraca 204 (success, no content)
 * ALE nic nie tworzy — to nie jest natywny upsert. Trzeba sprawdzić
 * istnienie pierwsze przez GET. Inny fix: try POST najpierw (insert),
 * jeśli 400 z "RECORD_NOT_UNIQUE" → PATCH. Idziemy POST-first bo szybsze
 * dla idempotent seedów (tylko 1 request gdy item istnieje, 1 dla insert).
 */
export async function upsertItem(
  collection: string,
  primaryKey: string,
  item: Record<string, unknown>,
): Promise<void> {
  // Try POST insert
  try {
    await directusFetch(`/items/${collection}`, {
      method: "POST",
      body: JSON.stringify(item),
    });
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 400 RECORD_NOT_UNIQUE / "primary key" → existing item, fallback PATCH
    if (
      msg.includes("RECORD_NOT_UNIQUE") ||
      msg.includes("primary") ||
      msg.includes("400") ||
      msg.includes("409")
    ) {
      await directusFetch(
        `/items/${collection}/${encodeURIComponent(primaryKey)}`,
        { method: "PATCH", body: JSON.stringify(item) },
      );
      return;
    }
    throw err;
  }
}

export async function listItems<T = unknown>(
  collection: string,
  query: Record<string, string | number> = {},
): Promise<T[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) qs.set(k, String(v));
  const path = `/items/${collection}${qs.toString() ? `?${qs.toString()}` : ""}`;
  return directusFetch<T[]>(path);
}

/**
 * Konfiguracja bazowa — kolekcje które dashboard pushuje do Directusa
 * przy `pushAll()`. Dodanie nowej kolekcji = jeden wpis tutaj.
 *
 * Categorie:
 *   - mp_app_catalog — kafelki/sub-views z tagami które admin uzupełnia
 *     ręcznie w Directusie. Dashboard pull-uje przy starcie i używa do
 *     wyszukiwarki Cmd+K (matching po keywords + tagach).
 *   - mp_announcements — system messages widoczne dla wszystkich userów
 *     (banery, ważne zmiany, planowane prace).
 *   - mp_branding_cms / mp_email_templates_cms — read-only mirror, edycja
 *     w /admin/email.
 */
export const COLLECTION_SPECS: CollectionSpec[] = [
  {
    collection: "mp_branding_cms",
    meta: {
      icon: "palette",
      note: "Branding stack-wide (logo, accent, footer). Edytuj w dashboardzie /admin/email.",
      singleton: true,
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true, has_auto_increment: false },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "logo_url",
        type: "string",
        meta: { interface: "input", readonly: true },
      },
      {
        field: "accent_color",
        type: "string",
        meta: { interface: "select-color", readonly: true },
      },
      {
        field: "footer_html",
        type: "text",
        meta: { interface: "input-rich-text-html", readonly: true },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true },
      },
    ],
  },
  {
    collection: "mp_email_templates_cms",
    meta: {
      icon: "mail",
      note: "Read-only mirror szablonów Keycloak. Edytuj w dashboardzie /admin/email.",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "kind",
        type: "string",
        meta: { interface: "input", readonly: true },
      },
      {
        field: "subject",
        type: "string",
        meta: { interface: "input", readonly: true },
      },
      {
        field: "html",
        type: "text",
        meta: { interface: "input-code", readonly: true, options: { language: "html" } },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true },
      },
    ],
  },

  // === App catalog z tagami — edytowalne w Directusie ===
  // Admin może dopisać tagi (csv) w Directus UI. Wyszukiwarka Cmd+K
  // pull-uje tagi i matchuje query (np. "umowa" → Documenso bo tag).
  // Dashboard ma fallback hardcoded TILES jeśli Directus niedostępny.
  {
    collection: "mp_app_catalog",
    meta: {
      icon: "apps",
      note: "Katalog kafelków/sub-views z tagami. Admin uzupełnia tagi (CSV) w tej zakładce — wyszukiwarka Cmd+K matchuje po nich.",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "title",
        type: "string",
        meta: { interface: "input", required: true, readonly: true },
      },
      {
        field: "subtitle",
        type: "string",
        meta: { interface: "input", readonly: true },
      },
      {
        field: "href",
        type: "string",
        meta: { interface: "input", readonly: true },
      },
      {
        field: "tags",
        type: "csv",
        meta: {
          interface: "tags",
          note: "Słowa kluczowe które user wpisze w Cmd+K. Np. dla Documenso: umowa,podpis,sign,nda. Edytujesz tu — nie w kodzie.",
        },
      },
      {
        field: "requires_area",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          note: "Area z AREAS registry. User bez tej area nie zobaczy.",
        },
      },
      {
        field: "requires_min_priority",
        type: "integer",
        meta: { interface: "input", readonly: true },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true },
      },
    ],
  },

  // === Areas registry — mirror z lib/permissions/areas.ts ===
  // Read-only mirror — zmiana w kodzie wymaga deployu (kc-sync seeduje
  // realm roles z tej listy + assignuje role-mappings). Directus pokazuje
  // bieżący stan żeby admin widział strukturę uprawnień bez czytania kodu.
  {
    collection: "mp_areas_registry",
    meta: {
      icon: "shield",
      note: "READ-ONLY mirror obszarów uprawnień (AREAS w kodzie). Edycja w lib/permissions/areas.ts wymaga deployu. Tu widzisz bieżący stan.",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      { field: "label", type: "string", meta: { interface: "input", readonly: true } },
      { field: "description", type: "text", meta: { interface: "input-multiline", readonly: true } },
      { field: "provider", type: "string", meta: { interface: "input", readonly: true } },
      { field: "icon", type: "string", meta: { interface: "input", readonly: true } },
      { field: "kc_roles_count", type: "integer", meta: { interface: "input", readonly: true } },
      { field: "kc_roles", type: "json", meta: { interface: "input-code", readonly: true, options: { language: "json" } } },
      { field: "synced_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
    ],
  },

  // === Notif events catalog — mirror z lib/preferences.ts NOTIF_EVENTS ===
  {
    collection: "mp_notif_events_registry",
    meta: {
      icon: "notifications",
      note: "READ-ONLY katalog typów powiadomień. Defaults i requiresArea są w kodzie (lib/preferences.ts). Tu listing dla orientacji.",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      { field: "label", type: "string", meta: { interface: "input", readonly: true } },
      { field: "category", type: "string", meta: { interface: "input", readonly: true } },
      { field: "default_in_app", type: "boolean", meta: { interface: "boolean", readonly: true } },
      { field: "default_email", type: "boolean", meta: { interface: "boolean", readonly: true } },
      { field: "requires_area", type: "string", meta: { interface: "input", readonly: true } },
      { field: "synced_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
    ],
  },

  // === Email layouts — mirror z mp_email_layouts ===
  {
    collection: "mp_email_layouts_cms",
    meta: {
      icon: "view_quilt",
      note: "Layouty (header/footer wrapper dla emaili). Edytuj w /admin/email > Layouts. Tu read-only mirror.",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      { field: "name", type: "string", meta: { interface: "input", readonly: true } },
      { field: "html", type: "text", meta: { interface: "input-code", readonly: true, options: { language: "html" } } },
      { field: "is_default", type: "boolean", meta: { interface: "boolean", readonly: true } },
      { field: "synced_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
    ],
  },

  // === SMTP configs — mirror BEZ secrets ===
  {
    collection: "mp_smtp_configs_cms",
    meta: {
      icon: "mail_outline",
      note: "Konfiguracje SMTP (alias, host, port, from). BEZ haseł — secrets pozostają w lokalnej DB. Edytuj w /admin/email > SMTP.",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      { field: "alias", type: "string", meta: { interface: "input", readonly: true } },
      { field: "host", type: "string", meta: { interface: "input", readonly: true } },
      { field: "port", type: "integer", meta: { interface: "input", readonly: true } },
      { field: "secure", type: "boolean", meta: { interface: "boolean", readonly: true } },
      { field: "from_address", type: "string", meta: { interface: "input", readonly: true } },
      { field: "from_name", type: "string", meta: { interface: "input", readonly: true } },
      { field: "synced_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
    ],
  },

  // === Footer / nav links — w pełni edytowalne w Directus ===
  // Footer dashboardu, sidebar, social links, pomoc URLs. Admin edytuje
  // bezpośrednio w Directus, dashboard pull-uje przy starcie + 5min cache.
  {
    collection: "mp_links",
    meta: {
      icon: "link",
      note: "Linki w UI: footer, sidebar, social. Edytuj swobodnie. category określa gdzie się pojawia.",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "category",
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: { choices: [
            { text: "Footer", value: "footer" },
            { text: "Sidebar / pomoc", value: "help" },
            { text: "Social media", value: "social" },
            { text: "Stopka emaili", value: "email-footer" },
          ]},
        },
      },
      { field: "label", type: "string", meta: { interface: "input", required: true } },
      { field: "url", type: "string", meta: { interface: "input", required: true } },
      { field: "icon", type: "string", meta: { interface: "input", note: "lucide icon name lub emoji" } },
      { field: "sort", type: "integer", meta: { interface: "input" }, schema: { default_value: 0 } },
      { field: "enabled", type: "boolean", meta: { interface: "boolean" }, schema: { default_value: true } },
      {
        field: "requires_area",
        type: "string",
        meta: { interface: "input", note: "Pusty = wszyscy. area-id = tylko z dostępem." },
      },
    ],
  },

  // === Klienckie certyfikaty mTLS — read-only mirror z issued_certificates ===
  {
    collection: "mp_certificates_cms",
    meta: {
      icon: "verified_user",
      note: "Certyfikaty klienckie mTLS. Mirror z lokalnej DB. Wystawienie/revoke w /admin/certificates (operacje w step-ca).",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      { field: "subject", type: "string", meta: { interface: "input", readonly: true, note: "Common Name" } },
      { field: "email", type: "string", meta: { interface: "input", readonly: true } },
      { field: "roles", type: "csv", meta: { interface: "tags", readonly: true, note: "panele które cert otwiera" } },
      { field: "serial_number", type: "string", meta: { interface: "input", readonly: true } },
      { field: "not_after", type: "timestamp", meta: { interface: "datetime", readonly: true } },
      { field: "issued_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
      { field: "revoked_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
      { field: "revoked_reason", type: "string", meta: { interface: "input", readonly: true } },
      { field: "synced_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
    ],
  },

  // === Blokady IP — read-only mirror mp_blocked_ips ===
  {
    collection: "mp_blocked_ips_cms",
    meta: {
      icon: "block",
      note: "Zablokowane IP (Wazuh AR + ręczne). Mirror. Akcje block/unblock w /admin/infrastructure?tab=blocks.",
    },
    fields: [
      {
        field: "ip",
        type: "string",
        schema: { is_primary_key: true },
        meta: { interface: "input", readonly: true },
      },
      { field: "reason", type: "text", meta: { interface: "input-multiline", readonly: true } },
      { field: "blocked_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
      { field: "expires_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
      { field: "blocked_by", type: "string", meta: { interface: "input", readonly: true } },
      { field: "source", type: "string", meta: { interface: "input", readonly: true } },
      { field: "attempts", type: "integer", meta: { interface: "input", readonly: true } },
      { field: "country", type: "string", meta: { interface: "input", readonly: true } },
      { field: "synced_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
    ],
  },

  // === OVH config — bez secrets ===
  {
    collection: "mp_ovh_config_cms",
    meta: {
      icon: "cloud",
      note: "OVH API config metadata (endpoint + appKey prefix). BEZ secrets — appSecret/consumerKey w env. Edytuj w /admin/email > OVH.",
      singleton: true,
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      { field: "endpoint", type: "string", meta: { interface: "input", readonly: true, note: "ovh-eu / ovh-us / ovh-ca" } },
      { field: "app_key_preview", type: "string", meta: { interface: "input", readonly: true, note: "First 8 chars (audit)" } },
      { field: "consumer_key_preview", type: "string", meta: { interface: "input", readonly: true, note: "First 8 chars (audit)" } },
      { field: "configured", type: "boolean", meta: { interface: "boolean", readonly: true } },
      { field: "synced_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
    ],
  },

  // === Panele certyfikatowe (sprzedawca/serwisant/kierowca/dokumenty) ===
  {
    collection: "mp_panels_cms",
    meta: {
      icon: "view_list",
      note: "Panele zewnętrzne wymagające mTLS. Edytuj domenę / role / opis tutaj — zmiany propagują do dashboardu.",
    },
    fields: [
      {
        field: "slug",
        type: "string",
        schema: { is_primary_key: true },
        meta: { interface: "input", readonly: true, note: "sprzedawca / serwisant / kierowca / dokumenty" },
      },
      { field: "label", type: "string", meta: { interface: "input", required: true } },
      { field: "domain", type: "string", meta: { interface: "input", required: true } },
      { field: "description", type: "text", meta: { interface: "input-multiline" } },
      { field: "required_role", type: "string", meta: { interface: "input", note: "KC realm role" } },
      { field: "mtls_required", type: "boolean", meta: { interface: "boolean" }, schema: { default_value: true } },
      { field: "icon", type: "string", meta: { interface: "input", note: "lucide icon name" } },
      { field: "sort", type: "integer", meta: { interface: "input" }, schema: { default_value: 0 } },
      { field: "enabled", type: "boolean", meta: { interface: "boolean" }, schema: { default_value: true } },
      { field: "synced_at", type: "timestamp", meta: { interface: "datetime", readonly: true } },
    ],
  },

  // === System announcements — widoczne na dashboardzie wszystkim userom ===
  {
    collection: "mp_announcements",
    meta: {
      icon: "campaign",
      note: "Banery / komunikaty systemowe wyświetlane na dashboardzie. enabled=true → widoczne. severity = info|warning|error.",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "title",
        type: "string",
        meta: { interface: "input", required: true },
      },
      {
        field: "body",
        type: "text",
        meta: { interface: "input-rich-text-md" },
      },
      {
        field: "severity",
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: { choices: [
            { text: "Informacja", value: "info" },
            { text: "Ostrzeżenie", value: "warning" },
            { text: "Krytyczne", value: "error" },
          ]},
        },
      },
      {
        field: "enabled",
        type: "boolean",
        meta: { interface: "boolean" },
        schema: { default_value: false },
      },
      {
        field: "starts_at",
        type: "timestamp",
        meta: { interface: "datetime" },
      },
      {
        field: "ends_at",
        type: "timestamp",
        meta: { interface: "datetime" },
      },
      {
        field: "requires_area",
        type: "string",
        meta: {
          interface: "input",
          note: "Pusty = wszyscy userzy. Wartość = tylko area-admini (np. infrastructure).",
        },
      },
    ],
  },
];
