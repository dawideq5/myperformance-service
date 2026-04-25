/**
 * Rejestr obszarów uprawnień (areas) — SoT dla ról per aplikacja.
 *
 * Każdy obszar deklaruje zestaw ról dostępnych do przypisania userowi
 * z dashboardu. Provider natywny (Chatwoot, Moodle, Documenso, Outline,
 * Directus, Postal) konsumuje native role id, a Keycloak realm role
 * (`<areaId>_<nativeRoleId>`) jest zsynchronizowaną 1:1 reprezentacją po
 * stronie IdP. User może mieć co najwyżej jedną rolę w obrębie area.
 *
 * Enterprise KC integration (`lib/permissions/kc-sync.ts`):
 *   - realm roles SEED-owane z tej listy + z `provider.listRoles()` dla
 *     area z `dynamicRoles=true` (Moodle — pełna lista ról z
 *     `core_role_get_roles`),
 *   - dla każdego area tworzona jest composite group `app-<areaId>`
 *     z mapowaniem na realm roles tej apki — admini mogą nadawać dostęp
 *     również poprzez członkostwo w grupie w KC Console,
 *   - role legacy, których nie ma ani w seedzie ani w provider-dynamic,
 *     są usuwane z realmu.
 */

export type AreaProviderKind = "keycloak-only" | "native";

export interface AreaRoleSeed {
  /** Realm role name (np. `chatwoot_admin`, `documenso_manager`). */
  name: string;
  /** Ludzki label po polsku — widoczny w UI. */
  label: string;
  description: string;
  /** user=10, manager=50, admin=90. Wyższy → wygrywa przy resolve. */
  priority: number;
  /** Native role id po stronie providera (np. Chatwoot `administrator`). */
  nativeRoleId?: string | null;
}

export interface PermissionArea {
  id: string;
  label: string;
  description: string;
  provider: AreaProviderKind;
  nativeProviderId?: string;
  kcRoles: AreaRoleSeed[];
  icon?: string;
  /**
   * URL do natywnego UI, gdzie admin edytuje drobnoziarniste uprawnienia
   * (np. capabilities w Moodle, permissions w Directus, role custom w
   * Chatwoot). Dashboard przypisuje tylko role top-level.
   */
  nativeAdminUrl?: string;
  /**
   * Gdy `true` — lista dostępnych ról pochodzi z
   * `provider.listRoles()` i jest synchronizowana do Keycloak przy
   * starcie serwera i na żądanie (`/api/admin/iam/sync-kc`). Seedy z
   * `kcRoles` są traktowane jako baseline, ale pełna lista może być
   * rozszerzona o role wykryte w aplikacji natywnej.
   *
   * Używane dla Moodle — admin może tam definiować własne role
   * (`core_role_get_roles`), które pojawią się w dashboardzie bez
   * zmiany kodu.
   */
  dynamicRoles?: boolean;
}

export const AREAS: PermissionArea[] = [
  {
    id: "chatwoot",
    label: "Chatwoot",
    description: "Live-chat klientów, email, kanały social.",
    provider: "native",
    nativeProviderId: "chatwoot",
    icon: "MessageSquare",
    nativeAdminUrl: "https://chat.myperformance.pl/app/accounts/1/agents",
    kcRoles: [
      {
        name: "chatwoot_agent",
        label: "Agent",
        description: "Agent obsługi klienta — obsługuje rozmowy.",
        priority: 10,
        nativeRoleId: "agent",
      },
      {
        name: "chatwoot_admin",
        label: "Administrator",
        description: "Administrator Chatwoota — konfiguracja, webhooki, integracje.",
        priority: 90,
        nativeRoleId: "administrator",
      },
    ],
  },
  {
    id: "moodle",
    label: "MyPerformance — Akademia (Moodle)",
    description: "LMS — szkolenia, kursy, certyfikaty.",
    provider: "native",
    nativeProviderId: "moodle",
    icon: "GraduationCap",
    nativeAdminUrl: "https://moodle.myperformance.pl/admin/roles/manage.php",
    dynamicRoles: true,
    kcRoles: [
      {
        name: "moodle_student",
        label: "Student",
        description: "Dostęp do kursów (rola domyślna).",
        priority: 10,
        nativeRoleId: "student",
      },
      {
        name: "moodle_manager",
        label: "Menedżer",
        description: "Manager Moodla — konfiguracja instancji, pluginy, użytkownicy.",
        priority: 90,
        nativeRoleId: "manager",
      },
    ],
  },
  {
    id: "directus",
    label: "Directus CMS",
    description: "Treści i dane aplikacji.",
    provider: "native",
    nativeProviderId: "directus",
    icon: "Database",
    nativeAdminUrl: "https://cms.myperformance.pl/admin/users",
    kcRoles: [
      {
        name: "directus_admin",
        label: "Administrator",
        description: "Administrator Directusa — role, permissions, kolekcje.",
        priority: 90,
        nativeRoleId: null,
      },
    ],
  },
  {
    id: "documenso",
    label: "Dokumenty (Documenso)",
    description: "E-podpis i obieg dokumentów.",
    provider: "native",
    nativeProviderId: "documenso",
    icon: "FileSignature",
    nativeAdminUrl: "https://sign.myperformance.pl/admin/users",
    kcRoles: [
      {
        name: "documenso_member",
        label: "Użytkownik",
        description: "Pracownik — podpisuje własne dokumenty.",
        priority: 10,
        nativeRoleId: "MEMBER",
      },
      {
        name: "documenso_manager",
        label: "Menedżer",
        description:
          "Zarządza członkami zespołu i ma wgląd w dokumenty restricted-to-manager.",
        priority: 50,
        nativeRoleId: "MANAGER",
      },
      {
        name: "documenso_admin",
        label: "Administrator",
        description: "Administrator Documenso — użytkownicy, szablony, webhooki.",
        priority: 90,
        nativeRoleId: "ADMIN",
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
    nativeAdminUrl: "https://knowledge.myperformance.pl/settings/members",
    kcRoles: [
      {
        name: "knowledge_viewer",
        label: "Widz",
        description: "Tylko do odczytu — nie może tworzyć ani edytować dokumentów.",
        priority: 10,
        nativeRoleId: "viewer",
      },
      {
        name: "knowledge_editor",
        label: "Edytor",
        description: "Tworzy i edytuje dokumenty oraz kolekcje.",
        priority: 50,
        nativeRoleId: "member",
      },
      {
        name: "knowledge_admin",
        label: "Administrator",
        description: "Administrator Outline — użytkownicy, grupy, integracje.",
        priority: 90,
        nativeRoleId: "admin",
      },
    ],
  },
  {
    id: "postal",
    label: "Postal",
    description: "Transactional + newsletter mail sender.",
    provider: "native",
    nativeProviderId: "postal",
    icon: "Mail",
    nativeAdminUrl: "https://postal.myperformance.pl/users",
    kcRoles: [
      {
        name: "postal_admin",
        label: "Administrator",
        description: "Administrator Postal — serwery, domeny, polityki.",
        priority: 90,
        nativeRoleId: "admin",
      },
    ],
  },
  {
    id: "certificates",
    label: "Certyfikaty klienckie",
    description: "Wydawanie i odwoływanie certyfikatów mTLS (step-ca).",
    provider: "keycloak-only",
    icon: "ShieldCheck",
    kcRoles: [
      {
        name: "certificates_admin",
        label: "Administrator",
        description: "Wydawanie i odwoływanie certyfikatów klienckich.",
        priority: 90,
      },
    ],
  },
  {
    id: "stepca",
    label: "step-ca (PKI)",
    description: "Konsola administracyjna urzędu certyfikacji.",
    provider: "keycloak-only",
    icon: "Shield",
    kcRoles: [
      {
        name: "stepca_admin",
        label: "Administrator",
        description: "Administrator step-ca — provisionery, polityki, root.",
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
        label: "Administrator",
        description: "Administrator Keycloak — klienci, realm settings, flows.",
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
        label: "Użytkownik",
        description: "Dostęp do grafiku i ewidencji czasu.",
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
        label: "Użytkownik",
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
        label: "Użytkownik",
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
        label: "Użytkownik",
        description: "Dostęp do panelu kierowcy.",
        priority: 10,
      },
    ],
  },
  {
    id: "wazuh",
    label: "Wazuh SIEM",
    description: "Monitoring bezpieczeństwa, wykrywanie zagrożeń, FIM, alerty.",
    provider: "keycloak-only",
    icon: "ShieldAlert",
    nativeAdminUrl: "https://wazuh.myperformance.pl",
    kcRoles: [
      {
        name: "wazuh_readonly",
        label: "Read-only",
        description: "Podgląd dashboardu Wazuh i alertów (bez zmian konfiguracji).",
        priority: 10,
      },
      {
        name: "wazuh_admin",
        label: "Administrator",
        description: "Pełny dostęp do Wazuh — agenty, reguły, polityki, użytkownicy.",
        priority: 90,
      },
    ],
  },
  {
    id: "core",
    label: "Dostęp do platformy",
    description: "Bazowa rola — auto-przypisywana każdemu zalogowanemu userowi.",
    provider: "keycloak-only",
    icon: "LogIn",
    kcRoles: [
      {
        name: "app_user",
        label: "Użytkownik",
        description: "Dostęp do dashboardu (domyślna).",
        priority: 1,
      },
    ],
  },
];

export function getArea(id: string): PermissionArea | null {
  return AREAS.find((a) => a.id === id) ?? null;
}

/**
 * Zwraca area dla podanego realm role name — dopasowanie po exact match
 * (seedy) albo po prefiksie `<areaId>_` (role dynamicznie wprowadzone przez
 * provider, np. z `core_role_get_roles` Moodla).
 */
export function findAreaForRole(roleName: string): PermissionArea | null {
  for (const area of AREAS) {
    if (area.kcRoles.some((r) => r.name === roleName)) return area;
  }
  for (const area of AREAS) {
    const prefix = `${area.id.replace(/-/g, "_")}_`;
    if (roleName.startsWith(prefix)) return area;
  }
  return null;
}

export function listAreaKcRoleNames(area: PermissionArea): string[] {
  return area.kcRoles.map((r) => r.name);
}

/** Zwraca seed z najwyższym priorytetem z podanych kandydatów. */
export function pickHighestPriorityRole(
  area: PermissionArea,
  candidates: string[],
): AreaRoleSeed | null {
  const set = new Set(candidates);
  const matches = area.kcRoles.filter((r) => set.has(r.name));
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) => (cur.priority > best.priority ? cur : best));
}

/** Nazwa composite-group w KC mapowana z area — np. `app-chatwoot`. */
export function kcGroupNameForArea(area: PermissionArea): string {
  return `app-${area.id}`;
}

/**
 * Realm role name dla dynamicznej roli providera — `<areaId>_<nativeRoleId>`
 * z sanityzacją. Używane w Moodle (area `moodle` + shortname roli
 * natywnej).
 */
export function kcRoleNameForDynamicRole(
  area: PermissionArea,
  nativeRoleId: string,
): string {
  const prefix = area.id.replace(/-/g, "_");
  const slug = nativeRoleId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${prefix}_${slug || "role"}`;
}

/**
 * Historyczny detektor — legacy custom roles (wcześniej wspierane). Po
 * uproszczeniu modelu nie jest już używany w UI, ale migracyjny skrypt
 * go wykorzystuje do usuwania starych obiektów.
 */
export function isCustomRoleKcName(name: string): boolean {
  return /^[a-z][a-z0-9_]*_custom_[a-z0-9_]+$/.test(name);
}

/**
 * Mapping legacy → nowych ról. Używane przez
 * `scripts/migrate-roles-2026-04.mjs`.
 */
export const LEGACY_ROLE_REMAP: Record<string, string> = {
  // Chatwoot — `chatwoot_user` → `chatwoot_agent`
  chatwoot_user: "chatwoot_agent",
  chatwoot_administrator: "chatwoot_admin",

  // Moodle — seed user/admin → student/manager
  moodle_user: "moodle_student",
  moodle_admin: "moodle_manager",
  moodle_editingteacher: "moodle_editingteacher", // no-op, just validate
  moodle_teacher: "moodle_teacher",

  // Documenso — member/admin zostają, admin bez zmian
  documenso_user: "documenso_member",
  documenso_handler: "documenso_manager",

  // Outline — stary pojedynczy user/admin → viewer/editor/admin
  knowledge_user: "knowledge_editor",

  // Directus — removed _user (admin-only app)
  directus_user: "__removed__",

  // Postal — removed _user (admin-only app)
  postal_user: "__removed__",
};
