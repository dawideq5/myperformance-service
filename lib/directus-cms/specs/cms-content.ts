import type { CollectionSpec } from "../types";

/**
 * Editable in Directus + read-only mirrors: footer/sidebar/social links,
 * client certificate mirror, blocked IPs mirror, and OVH config mirror.
 */

export const CMS_CONTENT_SPECS: CollectionSpec[] = [

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
];
