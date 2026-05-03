/**
 * Directus CMS sync layer. Dashboard pozostaje canonical SoT dla mp_branding
 * i mp_email_templates — Directus dostaje read-only mirror, żeby contentowy
 * zespół widział aktualne wartości w UI Directusa (np. do wglądu lub
 * referencji w innych collectionach).
 *
 * Sync jest jednokierunkowy (push z dashboardu). Edycja w Directusie
 * zostanie nadpisana przy kolejnym sync — to celowe, bo źródło to mp_*.
 *
 * Modułowy split:
 *   - types.ts        → public types (DirectusConfig, CollectionSpec, CmsAnnouncement, CmsLink)
 *   - client.ts       → low-level fetch wrapper + getConfig + isConfigured
 *   - items.ts        → CRUD na collections + items (ensureCollection, upsertItem, …)
 *   - reads.ts        → public read API (getActiveAnnouncements, getLinks)
 *   - specs/*.ts      → COLLECTION_SPECS pogrupowane po domenie
 */

export type {
  CollectionSpec,
  CmsAnnouncement,
  CmsLink,
  CollectionFolderSlug,
} from "./types";
export { COLLECTION_FOLDERS } from "./types";
export {
  isConfigured,
} from "./client";
export {
  ensureCollection,
  upsertItem,
  createItem,
  updateItem,
  deleteItem,
  listItems,
} from "./items";
export {
  getActiveAnnouncements,
  getLinks,
} from "./reads";
export { COLLECTION_SPECS } from "./specs";
