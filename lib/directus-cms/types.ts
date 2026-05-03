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
  /**
   * Wave 22 / F18 — collection-level folder ("group") w Directus content
   * navigation. Wartość = collection name folderu-nadrzędnego (Directus
   * używa schema-less collections jako folderów). Recognized buckets:
   * `mp_folder_dashboard`, `mp_folder_email`, `mp_folder_panele`,
   * `mp_folder_akademia`, `mp_folder_system`, `mp_folder_serwis`,
   * `mp_folder_business`. Skrypt `scripts/directus-reorganize.mjs` wstrzykuje
   * `meta.group = <folder>` przy apply.
   */
  group?: string;
}

/**
 * Wave 22 / F18 — folder buckets (Directus schema-less collections used as
 * navigation groups). Każdy folder to schema-less collection w Directus
 * (POST /collections z `schema: null`) — collections z `meta.group = <slug>`
 * pojawiają się w drzewie pod tym folderem.
 */
export const COLLECTION_FOLDERS = [
  {
    slug: "mp_folder_dashboard",
    label: "Dashboard",
    icon: "dashboard",
    note: "Kafelki dashboardu, banery, ogłoszenia.",
  },
  {
    slug: "mp_folder_email",
    label: "Email",
    icon: "mail",
    note: "Branding, layouts, szablony, profile SMTP.",
  },
  {
    slug: "mp_folder_panele",
    label: "Panele",
    icon: "view_list",
    note: "Lokalizacje, panele cert-gated, widoki publiczne.",
  },
  {
    slug: "mp_folder_serwis",
    label: "Serwis",
    icon: "build",
    note: "Zlecenia, reklamacje, części, transport, dokumenty.",
  },
  {
    slug: "mp_folder_business",
    label: "Biznes",
    icon: "trending_up",
    note: "Grupy targetowe, progi, cennik.",
  },
  // Akademia / Knowledge (mp_folder_akademia) celowo pominięta — brak
  // kolekcji w SoT (Moodle/Outline są zewnętrznymi appami, mirror nieistnieje).
  // Dodaj gdy pojawi się pierwszy Moodle/Outline mirror collection.
  {
    slug: "mp_folder_system",
    label: "System",
    icon: "settings",
    note: "Audit logs, certyfikaty, blokady IP, infra mirrors.",
  },
] as const;

export type CollectionFolderSlug = (typeof COLLECTION_FOLDERS)[number]["slug"];

export interface CmsAnnouncement {
  id: string;
  title: string;
  body: string | null;
  severity: "info" | "success" | "warning" | "critical";
  /** ISO timestamp; null = obowiązuje od razu. */
  activeFrom: string | null;
  /** ISO timestamp; null = bez końca. */
  activeUntil: string | null;
  isActive: boolean;
  sortOrder: number;
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
