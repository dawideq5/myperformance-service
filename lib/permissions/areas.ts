/**
 * Rejestr obszarów uprawnień (areas) — MODEL GRUBO-ZIARNISTY.
 *
 * Dashboard to **access gate** — decyduje "czy user ma dostęp do apki" i
 * "czy jest adminem tej apki". Fine-grained role, custom role, permisje
 * dla grup itd. edytuje się w **natywnym UI aplikacji** (Chatwoot agenci/
 * administratorzy + custom_roles, Directus roles + permissions, Outline
 * groups, Documenso teams + member roles, Moodle roles + context levels,
 * Postal permissions).
 *
 * Każdy area dostaje maks. 2 role KC:
 *   - `<areaId>_user`  — dostęp do apki na poziomie zwykłego użytkownika
 *   - `<areaId>_admin` — dostęp do konsoli administracyjnej apki
 *
 * Rola user = 0..1 role per user w danym area. `_admin` zastępuje `_user`
 * (admin ma dostęp user'a z definicji). Provider natywny robi **tylko** dwie
 * rzeczy: (1) stworzy usera przy pierwszym przypisaniu (jeśli apka nie
 * tworzy go sama na OIDC first-login), (2) ustawi flagę admin/non-admin.
 * CRUD ról jest niedostępny z dashboardu — wysyłamy admina do natywnego UI.
 */

export type AreaProviderKind = "keycloak-only" | "native";

export interface AreaRoleSeed {
  /** Realm role name (np. `chatwoot_user`, `chatwoot_admin`). */
  name: string;
  description: string;
  /** user=10, admin=90. Admin wyższy → wygrywa przy resolve. */
  priority: number;
  /** Native role id lub flaga dla providera (np. Chatwoot `administrator`). */
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
   * URL do natywnego UI w którym admin edytuje fine-grained role. Dashboard
   * pokazuje link "Zarządzaj rolami w aplikacji" obok toggle'a.
   */
  nativeAdminUrl?: string;
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
        name: "chatwoot_user",
        description: "Agent obsługi klienta (zwykły dostęp).",
        priority: 10,
        nativeRoleId: "agent",
      },
      {
        name: "chatwoot_admin",
        description: "Administrator Chatwoota (konfiguracja, webhooki).",
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
    nativeAdminUrl: "https://moodle.myperformance.pl/admin/roles/assign.php?contextid=1",
    kcRoles: [
      {
        name: "moodle_user",
        description: "Dostęp do kursów i szkoleń.",
        priority: 10,
        nativeRoleId: "student",
      },
      {
        name: "moodle_admin",
        description: "Manager Moodla (konfiguracja, pluginy, użytkownicy).",
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
        name: "directus_user",
        description: "Dostęp do Directusa z domyślną rolą.",
        priority: 10,
        nativeRoleId: null,
      },
      {
        name: "directus_admin",
        description: "Administrator Directusa (role + permisje w UI).",
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
        name: "documenso_user",
        description: "Pracownik — podpisuje własne dokumenty.",
        priority: 10,
        nativeRoleId: "MEMBER",
      },
      {
        name: "documenso_admin",
        description: "Administrator Documenso (szablony, webhooki).",
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
        name: "knowledge_user",
        description: "Dostęp do wiki (czytanie + edycja).",
        priority: 10,
        nativeRoleId: "member",
      },
      {
        name: "knowledge_admin",
        description: "Administrator Outline (grupy, integracje).",
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
        name: "postal_user",
        description: "Użytkownik Postal — dostęp do przypisanych serwerów.",
        priority: 10,
        nativeRoleId: "user",
      },
      {
        name: "postal_admin",
        description: "Administrator Postal (serwery, domeny, polityki).",
        priority: 90,
        nativeRoleId: "admin",
      },
    ],
  },
  {
    id: "stepca",
    label: "step-ca (PKI)",
    description: "Certyfikaty klienckie.",
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
    id: "core",
    label: "Dostęp do platformy",
    description: "Podstawowa rola domyślna — auto-przypisywana.",
    provider: "keycloak-only",
    icon: "LogIn",
    kcRoles: [
      {
        name: "app_user",
        description: "Dostęp do dashboardu (domyślna).",
        priority: 1,
      },
    ],
  },
];

export function getArea(id: string): PermissionArea | null {
  return AREAS.find((a) => a.id === id) ?? null;
}

/** Zwraca area dla KC roli — po exact match (nasze seedy) albo po prefiksie. */
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

/** Zwraca seed z najwyższym priorytetem z kandydatów; null jeśli pusta. */
export function pickHighestPriorityRole(
  area: PermissionArea,
  candidates: string[],
): AreaRoleSeed | null {
  const set = new Set(candidates);
  const matches = area.kcRoles.filter((r) => set.has(r.name));
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) => (cur.priority > best.priority ? cur : best));
}

/**
 * Historyczny detektor nazw custom ról — obecnie **nieużywany** w UI (custom
 * role zostały wycofane). Zostaje żeby migracyjny skrypt umiał rozpoznać
 * legacy naming i je usunąć.
 */
export function isCustomRoleKcName(name: string): boolean {
  return /^[a-z][a-z0-9_]*_custom_[a-z0-9_]+$/.test(name);
}

/**
 * Mapping starych ról fine-grained → nowych coarse. Używane przez
 * `scripts/migrate-roles-simplify.mjs`. Każdy wiersz: (legacy_kc_role,
 * new_kc_role). Po migracji stare role są usuwane z realmu.
 */
export const LEGACY_ROLE_REMAP: Record<string, string> = {
  // Chatwoot
  chatwoot_agent: "chatwoot_user",
  chatwoot_administrator: "chatwoot_admin",
  // Moodle
  moodle_student: "moodle_user",
  moodle_editingteacher: "moodle_user",
  moodle_manager: "moodle_admin",
  // Documenso (handler kolapsuje do user — admin promote w Documenso UI)
  documenso_handler: "documenso_user",
  // Outline
  knowledge_viewer: "knowledge_user",
};
