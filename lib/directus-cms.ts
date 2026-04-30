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

  // === Grupy targetowe (kategorie produktów / usług) ===
  // Każda grupa ma swój kod, label, opis. Architektonicznie przygotowane
  // pod przyszłą integrację z zewnętrznym systemem ERP — pole external_code
  // zostanie zmapowane na ich identyfikator. Na razie pusty.
  {
    collection: "mp_target_groups",
    meta: {
      icon: "category",
      note: "Kategorie produktów/usług dla planów punktów. Każda ma progi (mp_target_thresholds).",
      display_template: "{{label}} ({{code}})",
      sort_field: "sort",
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
        field: "code",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "tag", placeholder: "np. UCH_SAM, GWA_SZK" },
          note: "Krótki kod (CSV-friendly). Używany w API i raportach.",
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
          options: { iconLeft: "label" },
        },
      },
      {
        field: "description",
        type: "text",
        meta: { interface: "input-multiline", width: "full" },
      },
      {
        field: "unit",
        type: "string",
        schema: { default_value: "szt" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Sztuki (szt)", value: "szt" },
              { text: "Złote (PLN)", value: "PLN" },
              { text: "Komplety", value: "kpl" },
              { text: "Godziny (h)", value: "h" },
              { text: "Inne", value: "other" },
            ],
            allowOther: true,
          },
        },
      },
      {
        field: "external_code",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "link", font: "monospace" },
          note: "Mapping do zewnętrznego systemu ERP (opcjonalnie).",
        },
      },
      {
        field: "sort",
        type: "integer",
        schema: { default_value: 0 },
        meta: {
          interface: "input",
          width: "half",
          options: { min: 0, max: 999 },
        },
      },
      {
        field: "enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          width: "half",
          options: { label: "Aktywna grupa" },
        },
      },
    ],
  },

  // === Progi grup targetowych (od X do Y → wartość Z) ===
  // Pełna personalizacja per-grupa: dowolnie wiele progów, każdy z range
  // [from, to] i wartością (np. cena za szt, liczba punktów lojalnościowych,
  // procent prowizji). label opcjonalny dla custom nazwy progu.
  {
    collection: "mp_target_thresholds",
    meta: {
      icon: "tune",
      note: "Progi liczbowe per grupa targetowa. Range [from, to] → wartość. Dowolnie wiele progów.",
      display_template: "{{group}}: {{from_value}}–{{to_value}} → {{value}}",
      sort_field: "from_value",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "group",
        type: "uuid",
        schema: { is_nullable: false },
        meta: {
          interface: "select-dropdown-m2o",
          required: true,
          width: "full",
          options: { template: "{{label}} ({{code}})" },
          special: ["m2o"],
        },
      },
      {
        field: "label",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { placeholder: "np. Niski / Średni / Wysoki" },
          note: "Opcjonalna nazwa progu dla raportów (jeśli puste — generujemy z range).",
        },
      },
      {
        field: "from_value",
        type: "decimal",
        schema: { numeric_precision: 14, numeric_scale: 2, default_value: 0 },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "trending_flat" },
          note: "OD (włącznie). Może być 0.",
        },
      },
      {
        field: "to_value",
        type: "decimal",
        schema: { numeric_precision: 14, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "trending_flat" },
          note: "DO (włącznie). Puste = bez górnego limitu.",
        },
      },
      {
        field: "value",
        type: "decimal",
        schema: { numeric_precision: 14, numeric_scale: 2, is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "full",
          options: { iconLeft: "calculate" },
          note: "Wartość liczona dla tego progu (np. cena, prowizja, punkty).",
        },
      },
      {
        field: "color",
        type: "string",
        meta: {
          interface: "select-color",
          width: "half",
        },
      },
      {
        field: "sort",
        type: "integer",
        schema: { default_value: 0 },
        meta: { interface: "input", width: "half" },
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
        field: "requires_transport",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          width: "half",
          options: { label: "Wymaga transportu kurierskiego" },
          note: "TYLKO dla type=sales: zlecenia z tego punktu zawsze wymagają transportu przez kierowcę (nawet do powiązanego punktu serwisowego). Bez tego flagi transport tworzy się tylko gdy sprzedawca wybrał inny serwis niż domyślny.",
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

  // ==========================================================================
  // === MODUŁ SERWISOWY (mp_services / mp_claims / mp_protections + transport)
  // ==========================================================================
  // Wzorowany na schemacie referencyjnym (mperformance-master), rozszerzony o:
  //   - location m2o → mp_locations (powiązanie z punktem przyjęcia)
  //   - photos[] → URL-e zdjęć urządzenia (Directus folder "services")
  //   - transport_status → integracja z mp_transport_jobs (panel kierowcy)
  //   - chatwoot_conversation_id → link do rozmowy z klientem (auto-tworzona)
  //   - assigned_technician → email serwisanta (z Keycloak)
  // ==========================================================================
  {
    collection: "mp_services",
    meta: {
      icon: "build",
      note: "Zlecenia serwisowe — przyjęcia urządzeń. Cykl: przyjęty → diagnoza → naprawa → testy → gotowy → wydany. Klient kontaktowany przez Chatwoot.",
      display_template: "{{brand}} {{model}} ({{imei}}) — {{status}}",
      sort_field: "-created_at",
      archive_field: "status",
      archive_value: "archived",
      unarchive_value: "received",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "ticket_number",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          required: true,
          readonly: true,
          width: "half",
          options: { iconLeft: "tag", font: "monospace" },
          note: "Auto-generowany numer zgłoszenia (np. SVC-2026-04-0001).",
        },
      },
      {
        field: "status",
        type: "string",
        schema: { is_nullable: false, default_value: "received" },
        meta: {
          interface: "select-dropdown",
          required: true,
          width: "half",
          display: "labels",
          display_options: {
            showAsDot: true,
            choices: [
              { text: "Przyjęty", value: "received", foreground: "#fff", background: "#64748B" },
              { text: "Diagnoza", value: "diagnosing", foreground: "#fff", background: "#0EA5E9" },
              { text: "Wycena u klienta", value: "awaiting_quote", foreground: "#fff", background: "#F59E0B" },
              { text: "Naprawa", value: "repairing", foreground: "#fff", background: "#A855F7" },
              { text: "Testy", value: "testing", foreground: "#fff", background: "#06B6D4" },
              { text: "Gotowy do odbioru", value: "ready", foreground: "#fff", background: "#22C55E" },
              { text: "Wydany", value: "delivered", foreground: "#fff", background: "#16A34A" },
              { text: "Anulowany", value: "cancelled", foreground: "#fff", background: "#EF4444" },
              { text: "Archiwum", value: "archived", foreground: "#fff", background: "#1F2937" },
            ],
          },
          options: {
            choices: [
              { text: "Przyjęty", value: "received" },
              { text: "Diagnoza", value: "diagnosing" },
              { text: "Wycena u klienta", value: "awaiting_quote" },
              { text: "Naprawa", value: "repairing" },
              { text: "Testy", value: "testing" },
              { text: "Gotowy do odbioru", value: "ready" },
              { text: "Wydany", value: "delivered" },
              { text: "Anulowany", value: "cancelled" },
              { text: "Archiwum", value: "archived" },
            ],
          },
        },
      },
      {
        field: "location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "half",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
          note: "Punkt sprzedaży, w którym przyjęto urządzenie.",
        },
      },
      {
        field: "service_location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "half",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
          note: "Docelowy punkt serwisowy (jeśli inny niż punkt przyjęcia).",
        },
      },
      {
        field: "type",
        type: "string",
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Telefon", value: "phone" },
              { text: "Tablet", value: "tablet" },
              { text: "Laptop", value: "laptop" },
              { text: "Smartwatch", value: "smartwatch" },
              { text: "Słuchawki", value: "headphones" },
              { text: "Inne", value: "other" },
            ],
            allowOther: true,
          },
        },
      },
      { field: "brand", type: "string", meta: { interface: "input", width: "half" } },
      { field: "model", type: "string", meta: { interface: "input", width: "half" } },
      {
        field: "imei",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "qr_code", font: "monospace" },
          note: "IMEI 15 cyfr (telefony) lub serial number.",
        },
      },
      { field: "color", type: "string", meta: { interface: "input", width: "half" } },
      {
        field: "lock_type",
        type: "string",
        schema: { default_value: "none" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Brak blokady", value: "none" },
              { text: "PIN", value: "pin" },
              { text: "Wzór", value: "pattern" },
              { text: "Hasło", value: "password" },
              { text: "Face ID", value: "face" },
              { text: "Odcisk palca", value: "fingerprint" },
              { text: "Kombinowana", value: "multi" },
            ],
          },
        },
      },
      {
        field: "lock_code",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "lock", masked: true },
          note: "Kod / wzór blokady (PIN, wzór, hasło). Trzymane bezpiecznie — pole readable tylko dla serwisantów.",
        },
      },
      {
        field: "signed_in_account",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "account_circle", placeholder: "np. iCloud apple@... lub Google account" },
          note: "Konto na które urządzenie jest zalogowane (apple ID, google account itp.) — kluczowe dla diagnozy.",
        },
      },
      {
        field: "accessories",
        type: "json",
        meta: {
          interface: "tags",
          width: "full",
          options: {
            placeholder: "kabel, ładowarka, etui, słuchawki, sim_tray, pudełko, instrukcja",
            presets: [
              "kabel",
              "ładowarka",
              "etui",
              "szkło",
              "słuchawki",
              "pudełko",
              "instrukcja",
              "tacka_sim",
              "rysik",
            ],
          },
          note: "Akcesoria dostarczone razem z urządzeniem (do zwrotu).",
        },
      },
      {
        field: "intake_checklist",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "JSON" },
          note: "Checklista przyjęcia. JSON: {powers_on (yes/no/vibrates), bent (boolean), cracked_front (boolean), cracked_back (boolean), face_touch_id (boolean), water_damage (yes/no/unknown), notes}.",
        },
      },
      {
        field: "charging_current",
        type: "decimal",
        schema: { numeric_precision: 5, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "bolt" },
          note: "Prąd ładowania w amperach (X.XX A). Pomijane gdy water_damage = yes/unknown.",
        },
      },
      {
        field: "visual_condition",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "JSON" },
          note: "Stan wizualny urządzenia (z 3D walkthrough): { display_rating (1-10), display_notes, back_notes, camera_notes, frames_notes, earpiece_clean (boolean), speakers_clean (boolean), port_clean (boolean), additional_notes }.",
        },
      },
      {
        field: "description",
        type: "text",
        meta: {
          interface: "input-multiline",
          width: "full",
          options: { placeholder: "Opis usterki podany przez klienta" },
        },
      },
      {
        field: "diagnosis",
        type: "text",
        meta: {
          interface: "input-multiline",
          width: "full",
          options: { placeholder: "Diagnoza technika" },
        },
      },
      {
        field: "amount_estimate",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "payments" },
          note: "Wycena wstępna (PLN).",
        },
      },
      {
        field: "amount_final",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "payments" },
          note: "Kwota końcowa (PLN).",
        },
      },
      { field: "contact_phone", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "phone" } } },
      { field: "contact_email", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "mail" } } },
      { field: "customer_first_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "customer_last_name", type: "string", meta: { interface: "input", width: "half" } },
      {
        field: "photos",
        type: "json",
        meta: {
          interface: "list",
          width: "full",
          note: "URL-e zdjęć urządzenia (proxy /api/public/photos/{id}).",
        },
      },
      {
        field: "received_by",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "person", font: "monospace" },
          note: "Email pracownika który przyjął zlecenie (z Keycloak).",
        },
      },
      {
        field: "assigned_technician",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "engineering", font: "monospace" },
          note: "Email serwisanta przypisanego do zlecenia.",
        },
      },
      {
        field: "transport_status",
        type: "string",
        schema: { default_value: "none" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Brak transportu", value: "none" },
              { text: "Do odbioru", value: "pickup_pending" },
              { text: "W drodze do serwisu", value: "in_transit_to_service" },
              { text: "Dostarczony do serwisu", value: "delivered_to_service" },
              { text: "Do zwrotu klientowi", value: "return_pending" },
              { text: "W drodze do klienta", value: "in_transit_to_customer" },
              { text: "Dostarczony klientowi", value: "delivered_to_customer" },
            ],
          },
        },
      },
      {
        field: "chatwoot_conversation_id",
        type: "integer",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "chat", font: "monospace" },
          note: "ID rozmowy Chatwoot — auto-link do supportu klienta.",
        },
      },
      {
        field: "warranty_until",
        type: "date",
        meta: {
          interface: "datetime",
          width: "half",
          options: { iconLeft: "verified" },
          note: "Data końca gwarancji (jeśli serwis gwarancyjny).",
        },
      },
      {
        field: "promised_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          width: "half",
          options: { iconLeft: "schedule" },
          note: "Obiecany termin gotowości.",
        },
      },
      {
        field: "created_at",
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

  // === Reklamacje ===
  {
    collection: "mp_claims",
    meta: {
      icon: "report_problem",
      note: "Reklamacje klientów — produkt + paragon + opis usterki + żądanie. Powiązane z mp_locations (gdzie zgłoszono).",
      display_template: "{{customer_last_name}}, {{product_name}} — {{status}}",
      sort_field: "-created_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "claim_number",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          required: true,
          readonly: true,
          width: "half",
          options: { iconLeft: "tag", font: "monospace" },
        },
      },
      {
        field: "status",
        type: "string",
        schema: { default_value: "new" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Nowa", value: "new" },
              { text: "W rozpatrywaniu", value: "review" },
              { text: "Zaakceptowana", value: "accepted" },
              { text: "Odrzucona", value: "rejected" },
              { text: "Zakończona", value: "closed" },
            ],
          },
        },
      },
      {
        field: "location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "full",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
        },
      },
      { field: "customer_first_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "customer_last_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "phone", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "phone" } } },
      { field: "email", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "mail" } } },
      { field: "product_name", type: "string", meta: { interface: "input", width: "full" } },
      { field: "purchase_date", type: "date", meta: { interface: "datetime", width: "half" } },
      { field: "receipt_number", type: "string", meta: { interface: "input", width: "half", options: { font: "monospace" } } },
      {
        field: "product_value",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2 },
        meta: { interface: "input", width: "half", options: { iconLeft: "payments" } },
      },
      {
        field: "defect_description",
        type: "text",
        meta: { interface: "input-multiline", width: "full" },
      },
      {
        field: "customer_demand",
        type: "string",
        meta: {
          interface: "select-dropdown",
          width: "full",
          options: {
            choices: [
              { text: "Naprawa", value: "repair" },
              { text: "Wymiana", value: "exchange" },
              { text: "Zwrot pieniędzy", value: "refund" },
              { text: "Obniżenie ceny", value: "discount" },
            ],
            allowOther: true,
          },
        },
      },
      { field: "received_by", type: "string", meta: { interface: "input", width: "full", options: { iconLeft: "person" } } },
      {
        field: "photos",
        type: "json",
        meta: { interface: "list", width: "full" },
      },
      {
        field: "created_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } },
      },
      {
        field: "updated_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } },
      },
    ],
  },

  // === Pakiet ochronny ===
  {
    collection: "mp_protections",
    meta: {
      icon: "shield",
      note: "Pakiety ochronne (szkło hartowane, gwarancja rozszerzona) sprzedane do urządzeń. Powiązane z punktem sprzedaży.",
      display_template: "{{brand}} {{model}} ({{imei}})",
      sort_field: "-created_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "full",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
        },
      },
      { field: "brand", type: "string", meta: { interface: "input", width: "half" } },
      { field: "model", type: "string", meta: { interface: "input", width: "half" } },
      {
        field: "imei",
        type: "string",
        meta: { interface: "input", width: "half", options: { font: "monospace" } },
      },
      {
        field: "glass_type",
        type: "string",
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Bez szkła", value: "none" },
              { text: "Standard 2.5D", value: "standard" },
              { text: "Szkło UV", value: "uv" },
              { text: "Szkło prywatyzujące", value: "privacy" },
              { text: "Szkło 3D pełne", value: "full_3d" },
            ],
            allowOther: true,
          },
        },
      },
      {
        field: "extended_warranty",
        type: "boolean",
        schema: { default_value: false },
        meta: { interface: "boolean", width: "half", options: { label: "Gwarancja rozszerzona" } },
      },
      {
        field: "warranty_months",
        type: "integer",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "schedule", min: 0, max: 60 },
          note: "Długość gwarancji rozszerzonej (miesiące).",
        },
      },
      {
        field: "amount",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2 },
        meta: { interface: "input", width: "half", options: { iconLeft: "payments" } },
      },
      { field: "customer_first_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "customer_last_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "phone", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "phone" } } },
      { field: "email", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "mail" } } },
      { field: "sold_by", type: "string", meta: { interface: "input", width: "full", options: { iconLeft: "person" } } },
      {
        field: "created_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } },
      },
      {
        field: "updated_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } },
      },
    ],
  },

  // === Typy napraw (skalowalna definicja katalogu usług) ===
  // Każda pozycja to rodzaj naprawy (np. "Wymiana wyświetlacza") z:
  // - default_warranty_months: gwarancja (null = brak)
  // - time_min/max + time_unit: zakres czasu naprawy
  // - combinable_mode + combinable_with: kogo można łączyć z tą naprawą
  // - sums_mode + sums_with: czy łączenie sumuje cenę (alternatywa: "skontaktuj się z serwisantem")
  // - icon: nazwa lucide (np. "Battery", "Wrench")
  // mp_pricelist linkuje przez `repair_type_code` (string FK).
  {
    collection: "mp_repair_types",
    meta: {
      icon: "build",
      note: "Katalog rodzajów napraw — etykiety, ikony, gwarancja, czas, reguły łączenia z innymi naprawami.",
      display_template: "{{label}} ({{code}})",
      sort_field: "sort_order",
      archive_field: "is_active",
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
        field: "code",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "tag", font: "monospace" },
          note: "Stabilny identyfikator (np. SCREEN_REPLACEMENT). A-Z 0-9 _",
        },
      },
      { field: "label", type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true, width: "half", note: "Polska etykieta widoczna w UI." } },
      { field: "icon", type: "string", schema: { default_value: "Wrench" }, meta: { interface: "input", width: "half", note: "Nazwa ikony lucide (Battery, Camera, Wrench...)." } },
      { field: "color", type: "string", schema: { default_value: "#3b82f6" }, meta: { interface: "select-color", width: "half" } },
      { field: "description", type: "text", meta: { interface: "input-multiline", width: "full", note: "Opis dla pracownika (kiedy używać)." } },
      // Gwarancja (per typ naprawy — nadrzędne nad mp_pricelist).
      { field: "default_warranty_months", type: "integer", schema: { is_nullable: true }, meta: { interface: "input", width: "third", note: "Domyślna gwarancja w miesiącach. Puste = brak gwarancji." } },
      // Czas naprawy.
      { field: "time_min", type: "integer", schema: { is_nullable: true }, meta: { interface: "input", width: "third", note: "Min czas (w wybranej jednostce)." } },
      { field: "time_max", type: "integer", schema: { is_nullable: true }, meta: { interface: "input", width: "third", note: "Max czas." } },
      {
        field: "time_unit",
        type: "string",
        schema: { default_value: "minutes" },
        meta: {
          interface: "select-dropdown",
          width: "third",
          options: {
            choices: [
              { text: "minuty", value: "minutes" },
              { text: "godziny", value: "hours" },
              { text: "dni", value: "days" },
            ],
          },
        },
      },
      // Reguły łączenia.
      {
        field: "combinable_mode",
        type: "string",
        schema: { default_value: "yes" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Tak — łącz z każdym", value: "yes" },
              { text: "Nie — naprawa wyłączna", value: "no" },
              { text: "Tylko z wybranymi", value: "only_with" },
              { text: "Z każdym z wyjątkiem", value: "except" },
            ],
          },
          note: "Czy ta naprawa może być łączona z innymi w jednym zleceniu.",
        },
      },
      { field: "combinable_with", type: "json", schema: { default_value: "[]" }, meta: { interface: "list", width: "half", note: "Tablica kodów napraw (relevant gdy only_with/except)." } },
      // Reguły sumowania ceny.
      {
        field: "sums_mode",
        type: "string",
        schema: { default_value: "yes" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Tak — sumuj cenę", value: "yes" },
              { text: "Nie — kontakt z serwisantem", value: "no" },
              { text: "Tylko z wybranymi", value: "only_with" },
              { text: "Z każdym z wyjątkiem", value: "except" },
            ],
          },
          note: "Czy łączenie z innymi sumuje cenę (no = wymagany kontakt z serwisantem).",
        },
      },
      { field: "sums_with", type: "json", schema: { default_value: "[]" }, meta: { interface: "list", width: "half", note: "Tablica kodów (relevant gdy only_with/except)." } },
      // Meta.
      { field: "is_active", type: "boolean", schema: { default_value: true }, meta: { interface: "boolean", width: "half" } },
      { field: "sort_order", type: "integer", schema: { default_value: 0 }, meta: { interface: "input", width: "half" } },
    ],
  },

  // === Cennik ===
  // Pozycje cennika edytowane przez admin /admin/config (read-only w panelach).
  {
    collection: "mp_pricelist",
    meta: {
      icon: "sell",
      note: "Cennik usług serwisowych i pakietów. Pozycje grupowane po category. Edytowany przez admina.",
      display_template: "{{name}} ({{category}}) — {{price}} PLN",
      sort_field: "sort",
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
        field: "code",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "tag", font: "monospace" },
          note: "Krótki kod pozycji (np. ECR_IPH_15).",
        },
      },
      { field: "name", type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true, width: "half" } },
      {
        field: "category",
        type: "string",
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Wymiana ekranu", value: "screen" },
              { text: "Wymiana baterii", value: "battery" },
              { text: "Naprawa wody", value: "water_damage" },
              { text: "Naprawa płyty głównej", value: "logic_board" },
              { text: "Wymiana złącza", value: "port" },
              { text: "Pakiet ochronny", value: "protection" },
              { text: "Diagnostyka", value: "diagnostic" },
              { text: "Inne", value: "other" },
            ],
            allowOther: true,
          },
        },
      },
      {
        field: "price",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2, is_nullable: false },
        meta: { interface: "input", required: true, width: "half", options: { iconLeft: "payments" } },
      },
      { field: "description", type: "text", meta: { interface: "input-multiline", width: "full" } },
      { field: "warranty_months", type: "integer", meta: { interface: "input", width: "half" } },
      { field: "duration_minutes", type: "integer", meta: { interface: "input", width: "half", note: "Szacowany czas wykonania (min)." } },
      { field: "sort", type: "integer", schema: { default_value: 0 }, meta: { interface: "input", width: "half" } },
      { field: "enabled", type: "boolean", schema: { default_value: true }, meta: { interface: "boolean", width: "half", options: { label: "Pozycja aktywna" } } },
      // Brand/model targeting — pozycja stosowana tylko gdy device match.
      // null = pasuje do wszystkich (default).
      { field: "brand", type: "string", schema: { is_nullable: true }, meta: { interface: "input", width: "half", note: "Marka urządzenia (Apple, Samsung, ...). Puste = wszystkie." } },
      { field: "model_pattern", type: "string", schema: { is_nullable: true }, meta: { interface: "input", width: "half", note: "Substring nazwy modelu (np. 'iPhone 12'). Puste = wszystkie modele tej marki." } },
    ],
  },

  // === Historia edycji serwisu ===
  // Każda zmiana w mp_services rejestrowana jako revision row. Pozwala
  // na audit (kto, co, kiedy zmienił) + generację aneksu gdy zmiana
  // dotyczy istotnych pól (cena, opis, zakres usług). Brak FK do
  // mp_services (Directus REST nie wspiera ON DELETE CASCADE z UI),
  // service_id trzymane jako uuid + handler purge przy delete service.
  {
    collection: "mp_service_revisions",
    meta: {
      icon: "history",
      note: "Historia edycji zleceń serwisowych — kto, kiedy i jakie pola zmienił. Tylko-do-odczytu.",
      display_template: "{{ticket_number}} — {{edited_by_name}} ({{created_at}})",
      sort_field: "-created_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "service_id",
        type: "uuid",
        schema: { is_nullable: false },
        meta: { interface: "input", readonly: true, width: "half", note: "ID zlecenia serwisowego (mp_services.id)." },
      },
      {
        field: "ticket_number",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "edited_by_email",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "edited_by_name",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "change_kind",
        type: "string",
        schema: { default_value: "edit" },
        meta: {
          interface: "select-dropdown",
          readonly: true,
          width: "half",
          options: {
            choices: [
              { text: "Edycja", value: "edit" },
              { text: "Zmiana statusu", value: "status_change" },
              { text: "Aneks wystawiony", value: "annex_issued" },
              { text: "Documenso", value: "documenso" },
            ],
          },
        },
      },
      {
        field: "is_significant",
        type: "boolean",
        schema: { default_value: false },
        meta: { interface: "boolean", readonly: true, width: "half", note: "Wymaga aneksu (zmiana ceny/opisu/zakresu)." },
      },
      {
        field: "summary",
        type: "text",
        meta: { interface: "input-multiline", readonly: true, width: "full", note: "Czytelny opis zmian (po polsku)." },
      },
      {
        field: "changes",
        type: "json",
        meta: { interface: "input-code", readonly: true, width: "full", options: { language: "json" }, note: "Diff JSON {field: {before, after}}." },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
    ],
  },

  // === Podpisy pracowników (per-user, embed w PDF) ===
  // Każdy sprzedawca konfiguruje swój podpis raz w panelu (rysowany lub
  // tekstowy) i jest on automatycznie embedowany we wszystkie generowane
  // PDF potwierdzeń. Klient podpisuje swój przez Documenso.
  {
    collection: "mp_user_signatures",
    meta: {
      icon: "draw",
      note: "Podpisy pracowników — embed w PDF potwierdzeń. 1 rekord per email.",
      display_template: "{{user_email}} — {{signed_name}}",
      sort_field: "-updated_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "user_email",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: { interface: "input", required: true, width: "half" },
      },
      {
        field: "signed_name",
        type: "string",
        meta: { interface: "input", width: "half", note: "Imię i nazwisko widoczne pod podpisem" },
      },
      {
        field: "png_data_url",
        type: "text",
        schema: { is_nullable: false },
        meta: { interface: "input-multiline", required: true, hidden: true, note: "Base64 PNG — embed w PDF" },
      },
      {
        field: "updated_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-updated"] },
      },
    ],
  },

  // === Action log — akcje na serwisach ===
  // Każda akcja na zleceniu (podpis, wysyłka, druk, ponowna wysyłka) loguje
  // wpis tutaj. Pozwala na pełen audit trail w widoku /serwis/[id] —
  // niezależnie od mp_service_revisions które trzyma diff edycji pól.
  {
    collection: "mp_service_actions",
    meta: {
      icon: "fact_check",
      note: "Audit log akcji na zleceniach serwisowych (podpis, wysyłka, druk).",
      display_template: "{{action}} — {{ticket_number}} ({{created_at}})",
      sort_field: "-created_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "service_id",
        type: "uuid",
        schema: { is_nullable: false },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "ticket_number",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "action",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "select-dropdown",
          readonly: true,
          width: "half",
          options: {
            choices: [
              { text: "Podpis pracownika", value: "employee_sign" },
              { text: "Wydruk PDF", value: "print" },
              { text: "Wysłano e-potwierdzenie", value: "send_electronic" },
              { text: "Ponowne wysłanie", value: "resend_electronic" },
              { text: "Klient podpisał", value: "client_signed" },
              { text: "Klient odrzucił", value: "client_rejected" },
              { text: "Aneks wystawiony", value: "annex_issued" },
              { text: "Inne", value: "other" },
            ],
          },
        },
      },
      {
        field: "actor_email",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "actor_name",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "summary",
        type: "text",
        meta: { interface: "input-multiline", readonly: true, width: "full" },
      },
      {
        field: "payload",
        type: "json",
        meta: { interface: "input-code", readonly: true, width: "full", options: { language: "json" } },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
    ],
  },

  // === Transport / dostawa (panel kierowcy) ===
  // Każde zlecenie transportu ma source + destination location, status, kierowcę,
  // ETA, podpis odbioru. Powiązany m2o z mp_services (które urządzenie wozimy).
  {
    collection: "mp_transport_jobs",
    meta: {
      icon: "local_shipping",
      note: "Zlecenia transportowe między punktami (odbiór do serwisu, zwrot do klienta). Panel kierowcy zarządza tymi zleceniami.",
      display_template: "{{job_number}} — {{status}}",
      sort_field: "-created_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "job_number",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: { interface: "input", required: true, readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "status",
        type: "string",
        schema: { default_value: "queued" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "W kolejce", value: "queued" },
              { text: "Przypisany kierowca", value: "assigned" },
              { text: "W drodze", value: "in_transit" },
              { text: "Dostarczony", value: "delivered" },
              { text: "Anulowany", value: "cancelled" },
            ],
          },
        },
      },
      {
        field: "kind",
        type: "string",
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Odbiór do serwisu", value: "pickup_to_service" },
              { text: "Zwrot do klienta", value: "return_to_customer" },
              { text: "Między magazynami", value: "warehouse_transfer" },
            ],
          },
        },
      },
      {
        field: "service",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "full",
          options: { template: "{{ticket_number}} — {{brand}} {{model}}" },
          special: ["m2o"],
          note: "Powiązany serwis (mp_services).",
        },
      },
      {
        field: "source_location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "half",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
        },
      },
      {
        field: "destination_location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "half",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
        },
      },
      {
        field: "destination_address",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "place" },
          note: "Adres ad-hoc (gdy zwrot do klienta — bez naszego punktu).",
        },
      },
      { field: "destination_lat", type: "decimal", schema: { numeric_precision: 9, numeric_scale: 6 }, meta: { interface: "input", width: "half" } },
      { field: "destination_lng", type: "decimal", schema: { numeric_precision: 9, numeric_scale: 6 }, meta: { interface: "input", width: "half" } },
      { field: "assigned_driver", type: "string", meta: { interface: "input", width: "full", options: { iconLeft: "person", font: "monospace" }, note: "Email kierowcy (z Keycloak)." } },
      { field: "scheduled_at", type: "timestamp", meta: { interface: "datetime", width: "half" } },
      { field: "picked_up_at", type: "timestamp", meta: { interface: "datetime", width: "half", readonly: true } },
      { field: "delivered_at", type: "timestamp", meta: { interface: "datetime", width: "half", readonly: true } },
      { field: "recipient_signature", type: "text", meta: { interface: "input-multiline", width: "full", note: "Base64 podpisu odbioru." } },
      { field: "notes", type: "text", meta: { interface: "input-multiline", width: "full" } },
      { field: "created_at", type: "timestamp", meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } } },
      { field: "updated_at", type: "timestamp", meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } } },
    ],
  },
];
