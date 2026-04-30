/**
 * Directus CMS — typy publiczne i wewnętrzne config.
 *
 * Dashboard pozostaje canonical SoT dla mp_branding i mp_email_templates —
 * Directus dostaje read-only mirror, żeby contentowy zespół widział aktualne
 * wartości w UI Directusa (np. do wglądu lub referencji w innych collectionach).
 *
 * Sync jest jednokierunkowy (push z dashboardu). Edycja w Directusie zostanie
 * nadpisana przy kolejnym sync — to celowe, bo źródło to mp_*.
 */

export interface DirectusConfig {
  baseUrl: string;
  token: string;
}

export interface CollectionSpec {
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
