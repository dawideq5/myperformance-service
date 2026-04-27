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
  // Directus meta jest bogate (display_template, sort_field, archive_field,
  // archive_value, unarchive_value, archive_app_filter itd.) — nie próbujemy
  // typować całości, akceptujemy dowolne klucze które Directus rozumie.
  meta?: Record<string, unknown>;
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
  let exists = true;
  try {
    await directusFetch(`/collections/${spec.collection}`);
  } catch {
    exists = false;
  }

  if (!exists) {
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
    return;
  }

  // Collection istnieje — reconcile meta + fields. Bez tego DIR-5 polish
  // (display_template, sort_field, archive_field, dropdown choices itd.)
  // nigdy nie trafiłby do produkcji, bo przy starcie kolekcje już istnieją.
  if (spec.meta) {
    await directusFetch(`/collections/${spec.collection}`, {
      method: "PATCH",
      body: JSON.stringify({ meta: spec.meta }),
    }).catch((err) => {
      logger.warn("collection meta patch failed", {
        collection: spec.collection,
        err: String(err),
      });
    });
  }

  if (spec.fields && spec.fields.length > 0) {
    let existingFieldNames = new Set<string>();
    try {
      const fields = await directusFetch<Array<{ field: string }>>(
        `/fields/${spec.collection}`,
      );
      existingFieldNames = new Set(fields.map((f) => f.field));
    } catch {
      // Brak możliwości pobrania pól — robimy POST zawsze, niech Directus
      // sam zwróci konflikt jeśli pole istnieje (i wtedy spadnie do PATCH).
    }

    for (const field of spec.fields) {
      const isPrimary =
        field.schema && (field.schema as { is_primary_key?: boolean }).is_primary_key === true;
      // Primary keys: skip — istnieją od momentu create collection, PATCH na
      // PK jest niebezpieczny (Directus odrzuca zmianę typu/specials).
      if (isPrimary) continue;

      if (existingFieldNames.has(field.field)) {
        // PATCH — tylko meta + schema (type rzadko się zmienia, a Directus
        // odrzuca zmianę typu na pełnej kolumnie z danymi).
        await directusFetch(
          `/fields/${spec.collection}/${field.field}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              meta: field.meta ?? {},
              ...(field.schema ? { schema: field.schema } : {}),
            }),
          },
        ).catch((err) => {
          logger.warn("field patch failed", {
            collection: spec.collection,
            field: field.field,
            err: String(err),
          });
        });
      } else {
        await directusFetch(`/fields/${spec.collection}`, {
          method: "POST",
          body: JSON.stringify(field),
        }).catch((err) => {
          logger.warn("field create failed", {
            collection: spec.collection,
            field: field.field,
            err: String(err),
          });
        });
      }
    }
  }

  logger.info("Directus collection reconciled", { collection: spec.collection });
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

/**
 * Create item w collection. Zwraca utworzony obiekt z auto-generated PK.
 * Dla idempotent seeds użyj `upsertItem` zamiast (próbuje POST + fallback
 * PATCH). createItem jest dla user-driven create (np. admin POST z UI).
 */
export async function createItem<T = Record<string, unknown>>(
  collection: string,
  item: Record<string, unknown>,
): Promise<T> {
  return directusFetch<T>(`/items/${collection}`, {
    method: "POST",
    body: JSON.stringify(item),
  });
}

/**
 * Update item w collection (PATCH). Zwraca zaktualizowany obiekt.
 * Directus partial update — wystarczy podać tylko pola które się zmieniły.
 */
export async function updateItem<T = Record<string, unknown>>(
  collection: string,
  primaryKey: string,
  item: Record<string, unknown>,
): Promise<T> {
  return directusFetch<T>(
    `/items/${collection}/${encodeURIComponent(primaryKey)}`,
    { method: "PATCH", body: JSON.stringify(item) },
  );
}

export async function deleteItem(
  collection: string,
  primaryKey: string,
): Promise<void> {
  try {
    await directusFetch(
      `/items/${collection}/${encodeURIComponent(primaryKey)}`,
      { method: "DELETE" },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404")) return; // already gone
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

// =============================================================================
// Public read API — używane przez dashboard do pull-owania user-facing CMS
// content (banery, linki w stopce). Zwracają [] gdy Directus niedostępny —
// dashboard musi tolerować brak treści (zero-state).
// =============================================================================

export interface CmsAnnouncement {
  id: string;
  title: string;
  body: string | null;
  severity: "info" | "warning" | "error";
  startsAt: string | null;
  endsAt: string | null;
  requiresArea: string | null;
}

export interface CmsLink {
  id: string;
  category: "footer" | "help" | "social" | "email-footer";
  label: string;
  url: string;
  icon: string | null;
  sort: number;
  requiresArea: string | null;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string | null;
  severity: string | null;
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  requires_area: string | null;
}

interface LinkRow {
  id: string;
  category: string | null;
  label: string;
  url: string;
  icon: string | null;
  sort: number | null;
  enabled: boolean;
  requires_area: string | null;
}

const SEVERITY_VALUES: ReadonlySet<CmsAnnouncement["severity"]> = new Set([
  "info",
  "warning",
  "error",
]);

export async function getActiveAnnouncements(): Promise<CmsAnnouncement[]> {
  if (!getConfig()) return [];
  try {
    const rows = await listItems<AnnouncementRow>("mp_announcements", {
      "filter[enabled][_eq]": "true",
      sort: "-starts_at",
      limit: 50,
    });
    const now = Date.now();
    return rows
      .filter((r) => {
        if (r.starts_at && Date.parse(r.starts_at) > now) return false;
        if (r.ends_at && Date.parse(r.ends_at) < now) return false;
        return true;
      })
      .map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        severity: SEVERITY_VALUES.has(r.severity as CmsAnnouncement["severity"])
          ? (r.severity as CmsAnnouncement["severity"])
          : "info",
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        requiresArea: r.requires_area || null,
      }));
  } catch (err) {
    logger.warn("getActiveAnnouncements failed", { err: String(err) });
    return [];
  }
}

export async function getLinks(
  category?: CmsLink["category"],
): Promise<CmsLink[]> {
  if (!getConfig()) return [];
  try {
    const query: Record<string, string | number> = {
      "filter[enabled][_eq]": "true",
      sort: "sort,label",
      limit: 200,
    };
    if (category) query["filter[category][_eq]"] = category;
    const rows = await listItems<LinkRow>("mp_links", query);
    return rows
      .filter((r) => r.label && r.url && r.category)
      .map((r) => ({
        id: r.id,
        category: r.category as CmsLink["category"],
        label: r.label,
        url: r.url,
        icon: r.icon,
        sort: r.sort ?? 0,
        requiresArea: r.requires_area || null,
      }));
  } catch (err) {
    logger.warn("getLinks failed", { err: String(err) });
    return [];
  }
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
      display_template: "Branding ({{accent_color}})",
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
        meta: {
          interface: "input",
          readonly: true,
          width: "full",
          options: { iconLeft: "image" },
        },
      },
      {
        field: "accent_color",
        type: "string",
        meta: {
          interface: "select-color",
          readonly: true,
          width: "half",
          display: "color",
        },
      },
      {
        field: "footer_html",
        type: "text",
        meta: {
          interface: "input-rich-text-html",
          readonly: true,
          width: "full",
        },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },
  {
    collection: "mp_email_templates_cms",
    meta: {
      icon: "mail",
      note: "Read-only mirror szablonów Keycloak. Edytuj w dashboardzie /admin/email.",
      display_template: "{{kind}} — {{subject}}",
      sort_field: "kind",
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
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "label" },
        },
      },
      {
        field: "subject",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "html",
        type: "text",
        meta: {
          interface: "input-code",
          readonly: true,
          width: "full",
          options: { language: "htmlmixed", lineNumber: true, lineWrapping: true },
        },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
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
      display_template: "{{title}}",
      sort_field: "title",
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
        meta: {
          interface: "input",
          required: true,
          readonly: true,
          width: "half",
          options: { iconLeft: "title" },
        },
      },
      {
        field: "subtitle",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "href",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "full",
          options: { iconLeft: "link", font: "monospace" },
        },
      },
      {
        field: "tags",
        type: "csv",
        meta: {
          interface: "tags",
          width: "full",
          options: { presets: ["umowa", "podpis", "kurs", "wiki", "chat", "email", "vps"] },
          note: "Słowa kluczowe które user wpisze w Cmd+K. Np. dla Documenso: umowa,podpis,sign,nda. Edytujesz tu — nie w kodzie.",
        },
      },
      {
        field: "requires_area",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "shield" },
          note: "Area z AREAS registry. User bez tej area nie zobaczy.",
        },
      },
      {
        field: "requires_min_priority",
        type: "integer",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { min: 0, max: 100 },
        },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
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
      display_template: "{{label}} ({{provider}})",
      sort_field: "label",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "label",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "description",
        type: "text",
        meta: { interface: "input-multiline", readonly: true, width: "full" },
      },
      {
        field: "provider",
        type: "string",
        meta: {
          interface: "select-dropdown",
          readonly: true,
          width: "half",
          options: {
            choices: [
              { text: "Keycloak (native)", value: "keycloak" },
              { text: "Documenso", value: "documenso" },
              { text: "Moodle", value: "moodle" },
              { text: "Outline", value: "outline" },
              { text: "Chatwoot", value: "chatwoot" },
              { text: "Postal", value: "postal" },
              { text: "Directus", value: "directus" },
              { text: "Wazuh", value: "wazuh" },
            ],
            allowOther: true,
          },
        },
      },
      {
        field: "icon",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "image" },
        },
      },
      {
        field: "kc_roles_count",
        type: "integer",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          display: "formatted-value",
          display_options: { suffix: " ról" },
        },
      },
      {
        field: "kc_roles",
        type: "json",
        meta: {
          interface: "input-code",
          readonly: true,
          width: "full",
          options: { language: "json", lineNumber: true },
        },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },

  // === Notif events catalog — mirror z lib/preferences.ts NOTIF_EVENTS ===
  {
    collection: "mp_notif_events_registry",
    meta: {
      icon: "notifications",
      note: "READ-ONLY katalog typów powiadomień. Defaults i requiresArea są w kodzie (lib/preferences.ts). Tu listing dla orientacji.",
      display_template: "{{label}} — {{category}}",
      sort_field: "category",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "label",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "category",
        type: "string",
        meta: {
          interface: "select-dropdown",
          readonly: true,
          width: "half",
          options: {
            choices: [
              { text: "Bezpieczeństwo", value: "security" },
              { text: "Konto", value: "account" },
              { text: "Integracje", value: "integrations" },
              { text: "System", value: "system" },
              { text: "Infrastruktura", value: "infrastructure" },
            ],
            allowOther: true,
          },
        },
      },
      {
        field: "default_in_app",
        type: "boolean",
        meta: { interface: "boolean", readonly: true, width: "half" },
      },
      {
        field: "default_email",
        type: "boolean",
        meta: { interface: "boolean", readonly: true, width: "half" },
      },
      {
        field: "requires_area",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "shield" },
        },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },

  // === Email layouts — mirror z mp_email_layouts ===
  {
    collection: "mp_email_layouts_cms",
    meta: {
      icon: "view_quilt",
      note: "Layouty (header/footer wrapper dla emaili). Edytuj w /admin/email > Layouts. Tu read-only mirror.",
      display_template: "{{name}}{{is_default ? ' • domyślny' : ''}}",
      sort_field: "name",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "name",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "is_default",
        type: "boolean",
        meta: { interface: "boolean", readonly: true, width: "half" },
      },
      {
        field: "html",
        type: "text",
        meta: {
          interface: "input-code",
          readonly: true,
          width: "full",
          options: { language: "htmlmixed", lineNumber: true, lineWrapping: true },
        },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },

  // === SMTP configs — mirror BEZ secrets ===
  {
    collection: "mp_smtp_configs_cms",
    meta: {
      icon: "mail_outline",
      note: "Konfiguracje SMTP (alias, host, port, from). BEZ haseł — secrets pozostają w lokalnej DB. Edytuj w /admin/email > SMTP.",
      display_template: "{{alias}} → {{host}}:{{port}}",
      sort_field: "alias",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "alias",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "label" },
        },
      },
      {
        field: "host",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "dns" },
        },
      },
      {
        field: "port",
        type: "integer",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { min: 1, max: 65535 },
        },
      },
      {
        field: "secure",
        type: "boolean",
        meta: {
          interface: "boolean",
          readonly: true,
          width: "half",
          options: { label: "TLS / STARTTLS" },
        },
      },
      {
        field: "from_address",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "alternate_email" },
        },
      },
      {
        field: "from_name",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
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
      display_template: "{{label}} ({{category}})",
      sort_field: "sort",
      archive_field: "enabled",
      archive_value: "false",
      unarchive_value: "true",
      archive_app_filter: false,
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
        schema: { is_nullable: false },
        meta: {
          interface: "select-dropdown",
          required: true,
          width: "half",
          display: "labels",
          display_options: {
            showAsDot: true,
            choices: [
              { text: "Footer", value: "footer", foreground: "#fff", background: "#5856D6" },
              { text: "Sidebar / pomoc", value: "help", foreground: "#fff", background: "#34C759" },
              { text: "Social media", value: "social", foreground: "#fff", background: "#FF2D55" },
              { text: "Stopka emaili", value: "email-footer", foreground: "#fff", background: "#FF9500" },
            ],
          },
          options: {
            choices: [
              { text: "Footer dashboardu", value: "footer" },
              { text: "Sidebar / pomoc", value: "help" },
              { text: "Social media", value: "social" },
              { text: "Stopka emaili", value: "email-footer" },
            ],
          },
        },
      },
      {
        field: "label",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "title", placeholder: "np. Polityka prywatności" },
        },
      },
      {
        field: "url",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "full",
          options: {
            iconLeft: "link",
            placeholder: "https://… lub /admin/…",
            font: "monospace",
            trim: true,
          },
        },
      },
      {
        field: "icon",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: {
            iconLeft: "image",
            placeholder: "np. shield, mail (lucide) lub emoji",
          },
          note: "Lucide icon name lub emoji.",
        },
      },
      {
        field: "sort",
        type: "integer",
        schema: { default_value: 0 },
        meta: {
          interface: "input",
          width: "half",
          display: "formatted-value",
          options: { min: 0, max: 999, step: 1, iconLeft: "sort" },
          note: "Niższe = wyżej na liście.",
        },
      },
      {
        field: "enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          width: "half",
          options: { label: "Widoczne w UI" },
        },
      },
      {
        field: "requires_area",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "shield" },
          note: "Pusty = wszyscy. area-id (np. infrastructure) = widoczne tylko dla userów z dostępem do tej area.",
        },
      },
    ],
  },

  // === Klienckie certyfikaty mTLS — read-only mirror z issued_certificates ===
  {
    collection: "mp_certificates_cms",
    meta: {
      icon: "verified_user",
      note: "Certyfikaty klienckie mTLS. Mirror z lokalnej DB. Wystawienie/revoke w /admin/certificates (operacje w step-ca).",
      display_template: "{{subject}} ({{email}})",
      sort_field: "issued_at",
      archive_field: "revoked_at",
      archive_app_filter: true,
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "subject",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "person" },
          note: "Common Name (CN) z certyfikatu.",
        },
      },
      {
        field: "email",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "alternate_email" },
        },
      },
      {
        field: "roles",
        type: "csv",
        meta: {
          interface: "tags",
          readonly: true,
          width: "full",
          note: "Panele które cert otwiera (sprzedawca / serwisant / kierowca).",
        },
      },
      {
        field: "serial_number",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "full",
          options: { iconLeft: "fingerprint", font: "monospace" },
        },
      },
      {
        field: "issued_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: false },
        },
      },
      {
        field: "not_after",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
          note: "Data wygaśnięcia.",
        },
      },
      {
        field: "revoked_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
      {
        field: "revoked_reason",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },

  // === Blokady IP — read-only mirror mp_blocked_ips ===
  {
    collection: "mp_blocked_ips_cms",
    meta: {
      icon: "block",
      note: "Zablokowane IP (Wazuh AR + ręczne). Mirror. Akcje block/unblock w /admin/infrastructure?tab=blocks.",
      display_template: "{{ip}} — {{country}} ({{attempts}}×)",
      sort_field: "blocked_at",
    },
    fields: [
      {
        field: "ip",
        type: "string",
        schema: { is_primary_key: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "router", font: "monospace" },
        },
      },
      {
        field: "country",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "public" },
          note: "ISO 3166-1 alpha-2.",
        },
      },
      {
        field: "reason",
        type: "text",
        meta: { interface: "input-multiline", readonly: true, width: "full" },
      },
      {
        field: "source",
        type: "string",
        meta: {
          interface: "select-dropdown",
          readonly: true,
          width: "half",
          options: {
            choices: [
              { text: "Wazuh AR", value: "wazuh" },
              { text: "Ręczne", value: "manual" },
              { text: "Threat-feed", value: "threat-feed" },
              { text: "Auto (rate-limit)", value: "auto" },
            ],
            allowOther: true,
          },
        },
      },
      {
        field: "attempts",
        type: "integer",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          display: "formatted-value",
          display_options: { suffix: "×" },
        },
      },
      {
        field: "blocked_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
      {
        field: "expires_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
          note: "NULL = blokada permanentna.",
        },
      },
      {
        field: "blocked_by",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },

  // === OVH config — bez secrets ===
  {
    collection: "mp_ovh_config_cms",
    meta: {
      icon: "cloud",
      note: "OVH API config metadata (endpoint + appKey prefix). BEZ secrets — appSecret/consumerKey w env. Edytuj w /admin/email > OVH.",
      singleton: true,
      display_template: "OVH ({{endpoint}}) — {{configured ? 'OK' : 'brak'}}",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "configured",
        type: "boolean",
        meta: {
          interface: "boolean",
          readonly: true,
          width: "half",
          options: { label: "Skonfigurowane (appSecret + consumerKey w env)" },
        },
      },
      {
        field: "endpoint",
        type: "string",
        meta: {
          interface: "select-dropdown",
          readonly: true,
          width: "half",
          options: {
            choices: [
              { text: "OVH Europa (ovh-eu)", value: "ovh-eu" },
              { text: "OVH USA (ovh-us)", value: "ovh-us" },
              { text: "OVH Kanada (ovh-ca)", value: "ovh-ca" },
              { text: "SoYouStart EU (soyoustart-eu)", value: "soyoustart-eu" },
              { text: "Kimsufi EU (kimsufi-eu)", value: "kimsufi-eu" },
            ],
            allowOther: true,
          },
        },
      },
      {
        field: "app_key_preview",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "key", font: "monospace" },
          note: "Pierwsze 8 znaków AppKey (audit-trail). Pełny klucz w env.",
        },
      },
      {
        field: "consumer_key_preview",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "vpn_key", font: "monospace" },
          note: "Pierwsze 8 znaków ConsumerKey (audit-trail). Pełny klucz w env.",
        },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },

  // === Panele certyfikatowe (sprzedawca/serwisant/kierowca/dokumenty) ===
  {
    collection: "mp_panels_cms",
    meta: {
      icon: "view_list",
      note: "Panele zewnętrzne wymagające mTLS. Edytuj label / opis — domena i required_role są ustalone przez infrastrukturę.",
      display_template: "{{label}} ({{domain}})",
      sort_field: "sort",
      archive_field: "enabled",
      archive_value: "false",
      unarchive_value: "true",
    },
    fields: [
      {
        field: "slug",
        type: "string",
        schema: { is_primary_key: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "tag" },
          note: "sprzedawca / serwisant / kierowca",
        },
      },
      {
        field: "label",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "label", placeholder: "Panel Sprzedawcy" },
        },
      },
      {
        field: "domain",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          readonly: true,
          width: "half",
          options: { iconLeft: "language", font: "monospace" },
          note: "Read-only — domena ustalona przez Traefik/DNS.",
        },
      },
      {
        field: "required_role",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "shield" },
          note: "Realm role w Keycloaku.",
        },
      },
      {
        field: "description",
        type: "text",
        meta: {
          interface: "input-multiline",
          width: "full",
          options: { placeholder: "Krótki opis funkcji panelu — wyświetlany na dashboardzie." },
        },
      },
      {
        field: "icon",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "image", placeholder: "Briefcase / Wrench / Truck" },
          note: "Lucide icon name.",
        },
      },
      {
        field: "sort",
        type: "integer",
        schema: { default_value: 0 },
        meta: {
          interface: "input",
          width: "half",
          options: { min: 0, max: 999, step: 1, iconLeft: "sort" },
        },
      },
      {
        field: "mtls_required",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          readonly: true,
          width: "half",
          options: { label: "Wymaga mTLS (zawsze tak — hard-locked)" },
        },
      },
      {
        field: "enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          width: "half",
          options: { label: "Widoczny na dashboardzie" },
        },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },

  // === System announcements — widoczne na dashboardzie wszystkim userom ===
  {
    collection: "mp_announcements",
    meta: {
      icon: "campaign",
      note: "Banery / komunikaty systemowe wyświetlane na dashboardzie. enabled=true → widoczne (w oknie starts_at..ends_at).",
      display_template: "{{severity}} • {{title}}",
      sort_field: "starts_at",
      archive_field: "enabled",
      archive_value: "false",
      unarchive_value: "true",
      archive_app_filter: false,
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
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "full",
          options: {
            iconLeft: "campaign",
            placeholder: "Krótki, konkretny tytuł — np. „Planowane prace serwisowe 27.04 21:00–23:00",
            trim: true,
          },
        },
      },
      {
        field: "severity",
        type: "string",
        schema: { default_value: "info", is_nullable: false },
        meta: {
          interface: "select-dropdown",
          required: true,
          width: "half",
          display: "labels",
          display_options: {
            showAsDot: true,
            choices: [
              { text: "Informacja", value: "info", foreground: "#fff", background: "#0A84FF" },
              { text: "Ostrzeżenie", value: "warning", foreground: "#000", background: "#FFD60A" },
              { text: "Krytyczne", value: "error", foreground: "#fff", background: "#FF453A" },
            ],
          },
          options: {
            choices: [
              { text: "Informacja (niebieski)", value: "info" },
              { text: "Ostrzeżenie (żółty)", value: "warning" },
              { text: "Krytyczne (czerwony)", value: "error" },
            ],
          },
        },
      },
      {
        field: "enabled",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          width: "half",
          options: { label: "Aktywne (widoczne na dashboardzie)" },
        },
      },
      {
        field: "body",
        type: "text",
        meta: {
          interface: "input-rich-text-md",
          width: "full",
          options: {
            toolbar: ["bold", "italic", "link", "bullist", "numlist", "code"],
            placeholder: "Treść komunikatu w Markdown.",
          },
        },
      },
      {
        field: "starts_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          width: "half",
          display: "datetime",
          display_options: { relative: true },
          note: "Pusty = od razu.",
        },
      },
      {
        field: "ends_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          width: "half",
          display: "datetime",
          display_options: { relative: true },
          note: "Pusty = bez końca.",
        },
      },
      {
        field: "requires_area",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "shield", placeholder: "(opcjonalnie) np. infrastructure" },
          note: "Pusty = widoczne dla wszystkich. area-id = tylko userzy z dostępem do tej area (np. infrastructure dla wiadomości techniczne).",
        },
      },
    ],
  },

  // === Punkty (sklepy / serwisy) — dane biznesowe ===
  // Edytowalne z dashboard /admin/locations LUB bezpośrednio w Directus UI.
  // Source of truth: Directus DB. Custom dashboard UI używa Directus REST.
  {
    collection: "mp_locations",
    meta: {
      icon: "place",
      note: "Punkty sprzedaży i serwisowe. Każdy ma adres + lokalizację GPS, godziny otwarcia, kontakt, plan budżetu, zdjęcia.",
      display_template: "{{name}} ({{warehouse_code}}) — {{type}}",
      sort_field: "name",
      archive_field: "enabled",
      archive_value: "false",
      unarchive_value: "true",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "name",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "full",
          options: { iconLeft: "label", placeholder: "Pełna nazwa punktu" },
        },
      },
      {
        field: "warehouse_code",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "warehouse", placeholder: "TS / GKU / SC1 / …" },
          note: "Kod magazynu (skrót). Wartości typu TS, GKU, SC1.",
        },
      },
      {
        field: "type",
        type: "string",
        schema: { is_nullable: false, default_value: "sales" },
        meta: {
          interface: "select-dropdown",
          required: true,
          width: "half",
          display: "labels",
          display_options: {
            showAsDot: true,
            choices: [
              { text: "Punkt sprzedaży", value: "sales", foreground: "#fff", background: "#0EA5E9" },
              { text: "Punkt serwisowy", value: "service", foreground: "#fff", background: "#F43F5E" },
            ],
          },
          options: {
            choices: [
              { text: "Punkt sprzedaży", value: "sales" },
              { text: "Punkt serwisowy", value: "service" },
            ],
          },
        },
      },
      {
        field: "address",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "home", placeholder: "Pełny adres (ulica, numer, kod, miasto)" },
        },
      },
      {
        field: "lat",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 7 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "near_me", placeholder: "52.2297" },
          note: "Latitude (decimal degrees). Drag pin na mapie żeby ustawić.",
        },
      },
      {
        field: "lng",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 7 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "near_me", placeholder: "21.0122" },
          note: "Longitude (decimal degrees).",
        },
      },
      {
        field: "description",
        type: "text",
        meta: {
          interface: "input-multiline",
          width: "full",
          options: { placeholder: "np. obok wejścia do galerii, parter, lokal nr 5" },
        },
      },
      {
        field: "email",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "alternate_email", placeholder: "punkt@firma.pl" },
        },
      },
      {
        field: "phone",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "phone", placeholder: "+48 …" },
        },
      },
      {
        field: "hours",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "json", lineNumber: true },
          note: 'Godziny otwarcia. Format: {"mon":"08-18","tue":"08-18",...,"sun":null,"sundays_handlowe":["2026-12-21"]}',
        },
      },
      {
        field: "photos",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "json" },
          note: "Max 3 URL-i zdjęć (string[] do 3 elementów). Wyświetlane w popup mapy.",
        },
      },
      {
        field: "budget_plan",
        type: "decimal",
        schema: { numeric_precision: 12, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          display: "formatted-value",
          display_options: { suffix: " PLN" },
          options: { iconLeft: "trending_up" },
        },
      },
      {
        field: "service_id",
        type: "uuid",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "build" },
          note: "TYLKO dla type=sales: UUID przypisanego punktu serwisowego (max 1).",
        },
      },
      {
        field: "sales_ids",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "json" },
          note: 'TYLKO dla type=service: lista UUID-ów podległych sklepów. Format: ["uuid1","uuid2",...]',
        },
      },
      {
        field: "enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          width: "half",
          options: { label: "Aktywny w systemie" },
        },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
      {
        field: "updated_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },
];
