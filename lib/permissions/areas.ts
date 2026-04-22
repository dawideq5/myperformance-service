/**
 * Rejestr obszarów uprawnień (areas).
 *
 * Area = jeden spójny obszar dostępu, z wymuszoną relacją **0..1 roli per
 * user**. Przykład: "chatwoot" ma role `chatwoot_agent` i `chatwoot_administrator`
 * w KC + ewentualne custom role Chatwoot — użytkownik dostaje co najwyżej
 * jedną z nich. Nigdy nie pojawią się równocześnie `documenso_user` +
 * `documenso_admin` — drugi przypisany kasuje pierwszy.
 *
 * Zasada nazewnicza: realm role zaczyna się od prefiksu `<areaId>_`, a sufiks
 * odpowiada natywnemu identyfikatorowi roli w aplikacji (np. Moodle używa
 * shortname `editingteacher`, więc KC role to `moodle_editingteacher`).
 * Custom role tworzone przez panel mają prefiks `<areaId>_custom_<slug>`.
 */

export type AreaProviderKind = "keycloak-only" | "native";

export interface AreaRoleSeed {
  /** Realm role name w Keycloak (np. `chatwoot_agent`). */
  name: string;
  description: string;
  /** Wyższe = ważniejsze. Używane przy rozstrzyganiu konfliktów przy migracji. */
  priority: number;
  /**
   * Mapa do natywnego id (tylko dla area.provider === "native"). Null dla
   * ról KC-only w obrębie area natywnego (rzadkie, ale możliwe).
   */
  nativeRoleId?: string | null;
}

export interface PermissionArea {
  id: string;
  label: string;
  description: string;
  provider: AreaProviderKind;
  /** Id providera w registry (tylko dla provider="native"). */
  nativeProviderId?: string;
  /** Seed ról KC dla tego area (używany przez seed-area-roles.ts i UI). */
  kcRoles: AreaRoleSeed[];
  /** Ikona lucide-react (nazwa) — UI pobiera dynamicznie. */
  icon?: string;
}

export const AREAS: PermissionArea[] = [
  {
    id: "chatwoot",
    label: "Chatwoot",
    description: "Obsługa rozmów z klientami (live-chat, email, kanały social).",
    provider: "native",
    nativeProviderId: "chatwoot",
    icon: "MessageSquare",
    kcRoles: [
      {
        name: "chatwoot_agent",
        description: "Agent obsługi klienta — rozmowy, kontakty.",
        priority: 10,
        nativeRoleId: "agent",
      },
      {
        name: "chatwoot_administrator",
        description: "Administrator konta Chatwoot — konfiguracja, webhooki, role.",
        priority: 90,
        nativeRoleId: "administrator",
      },
    ],
  },
  {
    id: "moodle",
    label: "MyPerformance — Akademia (Moodle)",
    description: "LMS — szkolenia wewnętrzne, kursy, certyfikaty.",
    provider: "native",
    nativeProviderId: "moodle",
    icon: "GraduationCap",
    kcRoles: [
      {
        name: "moodle_student",
        description: "Uczeń — dostęp do przypisanych kursów.",
        priority: 10,
        nativeRoleId: "student",
      },
      {
        name: "moodle_editingteacher",
        description: "Nauczyciel (edytujący) — tworzenie kursów, ocenianie.",
        priority: 50,
        nativeRoleId: "editingteacher",
      },
      {
        name: "moodle_manager",
        description: "Manager — pełny dostęp do konfiguracji, pluginów, użytkowników.",
        priority: 90,
        nativeRoleId: "manager",
      },
    ],
  },
  {
    id: "directus",
    label: "Directus CMS",
    description: "Zarządzanie treścią serwisu (artykuły, produkty, galeria).",
    provider: "native",
    nativeProviderId: "directus",
    icon: "Database",
    kcRoles: [
      {
        name: "directus_admin",
        description: "Pełny dostęp do Directus.",
        priority: 90,
        nativeRoleId: null, // mapowane dynamicznie na Administrator role w Directus
      },
    ],
  },
  {
    id: "documenso",
    label: "Dokumenty (Documenso)",
    description: "E-podpis — pracownik → obsługa (księgowa) → administrator.",
    provider: "keycloak-only",
    icon: "FileSignature",
    kcRoles: [
      {
        name: "documenso_user",
        description: "Pracownik — podpisuje własne dokumenty.",
        priority: 10,
      },
      {
        name: "documenso_handler",
        description: "Obsługa dokumentów (księgowa) — wysyła i śledzi obieg.",
        priority: 50,
      },
      {
        name: "documenso_admin",
        description: "Administrator Documenso — szablony, webhooki, użytkownicy.",
        priority: 90,
      },
    ],
  },
  {
    id: "knowledge",
    label: "Baza wiedzy (Outline)",
    description: "Wewnętrzna wiki — procedury, zasady, how-to.",
    provider: "native",
    nativeProviderId: "outline",
    icon: "BookOpen",
    kcRoles: [
      {
        name: "knowledge_viewer",
        description: "Tylko do odczytu — może czytać artykuły bez edycji.",
        priority: 5,
        nativeRoleId: "viewer",
      },
      {
        name: "knowledge_user",
        description: "Dostęp do wiki (czytanie + pisanie).",
        priority: 10,
        nativeRoleId: "member",
      },
      {
        name: "knowledge_admin",
        description: "Administrator Outline (kolekcje, użytkownicy, integracje).",
        priority: 90,
        nativeRoleId: "admin",
      },
    ],
  },
  {
    id: "postal",
    label: "Postal",
    description: "Transactional + newsletter email sender.",
    provider: "keycloak-only",
    icon: "Mail",
    kcRoles: [
      {
        name: "postal_admin",
        description: "Administrator Postal (serwery, domeny, polityki).",
        priority: 90,
      },
    ],
  },
  {
    id: "stepca",
    label: "step-ca (PKI)",
    description: "Certyfikaty klienckie dla paneli cert-gated.",
    provider: "keycloak-only",
    icon: "Shield",
    kcRoles: [
      {
        name: "certificates_admin",
        description: "Wydawanie i odwoływanie certyfikatów klienckich.",
        priority: 50,
      },
      {
        name: "stepca_admin",
        description: "Administrator step-ca (provisionery, polityki).",
        priority: 90,
      },
    ],
  },
  {
    id: "keycloak",
    label: "Keycloak",
    description: "Konsola administracyjna IdP.",
    provider: "keycloak-only",
    icon: "Key",
    kcRoles: [
      {
        name: "keycloak_admin",
        description: "Administrator Keycloak (klienci, realm settings).",
        priority: 90,
      },
    ],
  },
  {
    id: "kadromierz",
    label: "Kadromierz",
    description: "Grafik i ewidencja czasu pracy.",
    provider: "keycloak-only",
    icon: "Clock",
    kcRoles: [
      {
        name: "kadromierz_user",
        description: "Dostęp do grafiku Kadromierz.",
        priority: 10,
      },
    ],
  },
  {
    id: "panel-sprzedawca",
    label: "Panel Sprzedawca",
    description: "Cert-gated panel sprzedaży (mTLS).",
    provider: "keycloak-only",
    icon: "ShoppingCart",
    kcRoles: [
      {
        name: "sprzedawca",
        description: "Dostęp do panelu sprzedawcy.",
        priority: 10,
      },
    ],
  },
  {
    id: "panel-serwisant",
    label: "Panel Serwisant",
    description: "Cert-gated panel serwisu (mTLS).",
    provider: "keycloak-only",
    icon: "Wrench",
    kcRoles: [
      {
        name: "serwisant",
        description: "Dostęp do panelu serwisanta.",
        priority: 10,
      },
    ],
  },
  {
    id: "panel-kierowca",
    label: "Panel Kierowca",
    description: "Cert-gated panel kierowcy (mTLS).",
    provider: "keycloak-only",
    icon: "Truck",
    kcRoles: [
      {
        name: "kierowca",
        description: "Dostęp do panelu kierowcy.",
        priority: 10,
      },
    ],
  },
  {
    id: "admin",
    label: "Administracja platformą",
    description: "Konsole i operacje o podwyższonym ryzyku.",
    provider: "keycloak-only",
    icon: "ShieldCheck",
    kcRoles: [
      {
        name: "manage_users",
        description: "Zarządzanie kontami użytkowników (/admin/users).",
        priority: 50,
      },
    ],
  },
  {
    id: "core",
    label: "Dostęp do platformy",
    description: "Podstawowe role domyślne — auto-przypisywane.",
    provider: "keycloak-only",
    icon: "LogIn",
    kcRoles: [
      {
        name: "app_user",
        description: "Dostęp do dashboardu (domyślna dla każdego zalogowanego).",
        priority: 1,
      },
    ],
  },
];

export function getArea(id: string): PermissionArea | null {
  return AREAS.find((a) => a.id === id) ?? null;
}

/** Zwraca area, do którego należy podany realm role — po prefiksie lub literal match. */
export function findAreaForRole(roleName: string): PermissionArea | null {
  // Najpierw szukamy explicitu (role seed).
  for (const area of AREAS) {
    if (area.kcRoles.some((r) => r.name === roleName)) return area;
  }
  // Fallback po prefiksie — custom role (`<areaId>_custom_<slug>`) i nowe role
  // nieseedowane.
  for (const area of AREAS) {
    const prefix = `${area.id.replace(/-/g, "_")}_`;
    if (roleName.startsWith(prefix)) return area;
    // panele mają prefiks z "-" np. "panel-sprzedawca", ale role = "sprzedawca"
    // już łapiemy przez seed powyżej.
  }
  return null;
}

export function listAreaKcRoleNames(area: PermissionArea): string[] {
  return area.kcRoles.map((r) => r.name);
}

/** Zwraca seed z najwyższym priorytetem z listy kandydatów; null jeśli pusta. */
export function pickHighestPriorityRole(
  area: PermissionArea,
  candidates: string[],
): AreaRoleSeed | null {
  const candidateSet = new Set(candidates);
  const matches = area.kcRoles.filter((r) => candidateSet.has(r.name));
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) => (cur.priority > best.priority ? cur : best));
}

/**
 * Detektor legacy custom-role names — konwencja `<areaId>_custom_<slug>` była
 * używana przed przejściem na ściśle kanoniczny katalog ról. Zostaje jako
 * safety check dla starych danych (sprzątanych przez keycloak-reset-to-native.mjs).
 */
export function isCustomRoleKcName(name: string): boolean {
  return /^[a-z][a-z0-9_]*_custom_[a-z0-9_]+$/.test(name);
}
