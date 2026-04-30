import type { CollectionSpec } from "../types";
import { CMS_MIRRORS_SPECS } from "./cms-mirrors";
import { CMS_CONTENT_SPECS } from "./cms-content";
import { SYSTEM_SPECS } from "./system";
import { BUSINESS_SPECS } from "./business";
import { SERVICES_CORE_SPECS } from "./services-core";
import { SERVICES_EXTRAS_SPECS } from "./services-extras";

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
  ...CMS_MIRRORS_SPECS,
  ...CMS_CONTENT_SPECS,
  ...SYSTEM_SPECS,
  ...BUSINESS_SPECS,
  ...SERVICES_CORE_SPECS,
  ...SERVICES_EXTRAS_SPECS,
];
