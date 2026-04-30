import type { CollectionSpec } from "../types";

/**
 * System-level collections: mTLS-protected panels (sprzedawca/serwisant/
 * kierowca) i system announcements (banery widoczne na dashboardzie).
 */

export const SYSTEM_SPECS: CollectionSpec[] = [

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
];
