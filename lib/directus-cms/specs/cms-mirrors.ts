import type { CollectionSpec } from "../types";

/**
 * Read-only mirrors of dashboard data — Directus pokazuje aktualny stan
 * branding/email-templates/layouts/SMTP/app-catalog/areas/notif-events.
 * Edycja w dashboardzie (canonical SoT), Directus tylko pull.
 */

export const CMS_MIRRORS_SPECS: CollectionSpec[] = [
  {
    collection: "mp_branding_cms",
    group: "mp_folder_email",
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
    group: "mp_folder_email",
    meta: {
      icon: "mail",
      note: "Read-only mirror szablonów emaili (action_key z mp_email_templates). Edytuj w dashboardzie /admin/email.",
      // Pole `kind` w mirrorze odpowiada `action_key` w canonical mp_email_templates.
      display_template: "{{kind}}: {{subject}}",
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
    group: "mp_folder_dashboard",
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
    group: "mp_folder_system",
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
    group: "mp_folder_system",
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
    group: "mp_folder_email",
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
    group: "mp_folder_email",
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
];
