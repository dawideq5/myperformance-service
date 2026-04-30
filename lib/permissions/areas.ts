/**
 * Rejestr obszarów uprawnień (areas) — SoT dla ról per aplikacja.
 *
 * ## Config-driven od FAZA 4 (Wave 2)
 *
 * Lista areas jest ładowana z `config/areas.json` przy module-init przez
 * `loadAreasConfig()`. Plik JSON jest pojedynczym źródłem prawdy dla
 * obszarów uprawnień; modyfikacje (label, opis, role, priority,
 * native URL) NIE wymagają zmiany kodu — wystarczy edycja JSON
 * + restart aplikacji.
 *
 * ### Workflow zmian
 *
 *   1. Edytuj `config/areas.json`
 *   2. Restart aplikacji (Next.js)
 *   3. AREAS jest reloadowany z fallback na `DEFAULT_AREAS` jeśli
 *      schema mismatch / parse error
 *
 * ### Struktura JSON (per area)
 *
 *   - `id` (string, unique)
 *   - `label` / `description` (PL)
 *   - `provider`: "keycloak-only" | "native"
 *   - `nativeProviderId?`: id zarejestrowanego providera (np. "moodle")
 *   - `icon?`: nazwa ikony (lucide-react)
 *   - `dynamicRoles?`: bool — czy dociągać role z `provider.listRoles()`
 *   - `nativeAdminUrlEnv?`: nazwa env var dla URL providera
 *   - `nativeAdminUrlFallback?`: hardcoded URL fallback
 *   - `nativeAdminUrlTail?`: deep-link path (doklejany do base URL)
 *   - `kcRoles[]`: lista seedów ról (name, label, description, priority,
 *     nativeRoleId?)
 *
 * ### Fail-closed na schema mismatch
 *
 * Jeśli `loadAreasConfig()` napotka:
 *   - JSON parse error
 *   - Brakujące wymagane pola
 *   - Duplikaty `id`
 *   - Pustą listę `areas`
 *
 * → fallback na compile-time `DEFAULT_AREAS` (identyczne z config/areas.json
 * pod commit'em wave-4). Logowany jest warning, ale aplikacja startuje
 * z bezpiecznym defaultem zamiast crashować.
 *
 * ## Architektura runtime (kontekst)
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
 *
 * Service URLs są wczytywane z env (NEXT_PUBLIC_<APP>_URL) z hardkodowanym
 * fallback na produkcyjny URL — fail-soft, bo nativeAdminUrl jest tylko
 * UI hint dla admina (link otwiera natywny panel do konfiguracji
 * fine-grained), a nie ścieżka krytyczna do działania apki.
 */

export type AreaProviderKind = "keycloak-only" | "native";

/**
 * Resolve nativeAdminUrl z env z fallback na hardkodowane prod URL.
 * Plus tail path dla głębokich linków (agents, admin/users itd.).
 */
function nativeUrl(envName: string, fallbackBase: string, tail = ""): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env[envName]?.trim() : "";
  const base = (fromEnv || fallbackBase).replace(/\/$/, "");
  return tail ? `${base}${tail.startsWith("/") ? tail : `/${tail}`}` : base;
}

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

/**
 * Raw shape ze schematu JSON — surowy obiekt area zanim
 * `nativeAdminUrl` zostanie zresolvowany przez `nativeUrl()`.
 */
interface RawAreaConfig {
  id: string;
  label: string;
  description: string;
  provider: AreaProviderKind;
  nativeProviderId?: string;
  icon?: string;
  dynamicRoles?: boolean;
  /** ENV var name dla URL providera. */
  nativeAdminUrlEnv?: string;
  /** Hardcoded fallback URL gdy env nie ustawiony. */
  nativeAdminUrlFallback?: string;
  /** Deep-link path (np. /admin/users) doklejany do base. */
  nativeAdminUrlTail?: string;
  kcRoles: AreaRoleSeed[];
}

interface RawAreasFile {
  version?: number;
  areas: RawAreaConfig[];
}

/**
 * Compile-time fallback — identyczna struktura z `config/areas.json`
 * pod commit'em FAZA 4. Trzymana w kodzie aby aplikacja startowała
 * nawet jeśli plik JSON zostanie usunięty / uszkodzony.
 *
 * UWAGA: nie usuwać tej stałej. Edycje merytoryczne należy robić
 * w `config/areas.json` — tutaj dotykamy tylko gdy zmienia się
 * kontrakt typu `PermissionArea`.
 */
const DEFAULT_AREAS: PermissionArea[] = [
  {
    id: "chatwoot",
    label: "Chatwoot",
    description: "Live-chat klientów, email, kanały social.",
    provider: "native",
    nativeProviderId: "chatwoot",
    icon: "MessageSquare",
    nativeAdminUrl: nativeUrl(
      "NEXT_PUBLIC_CHATWOOT_URL",
      "https://chat.myperformance.pl",
      "/app/accounts/1/agents",
    ),
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
    nativeAdminUrl: nativeUrl(
      "NEXT_PUBLIC_MOODLE_URL",
      "https://moodle.myperformance.pl",
      "/admin/roles/manage.php",
    ),
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
    nativeAdminUrl: nativeUrl(
      "NEXT_PUBLIC_DIRECTUS_URL",
      "https://cms.myperformance.pl",
      "/admin/users",
    ),
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
    nativeAdminUrl: nativeUrl(
      "NEXT_PUBLIC_DOCUMENSO_URL",
      "https://sign.myperformance.pl",
      "/admin/users",
    ),
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
    nativeAdminUrl: nativeUrl(
      "NEXT_PUBLIC_OUTLINE_URL",
      "https://knowledge.myperformance.pl",
      "/settings/members",
    ),
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
    nativeAdminUrl: nativeUrl(
      "NEXT_PUBLIC_POSTAL_URL",
      "https://postal.myperformance.pl",
      "/users",
    ),
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
    id: "infrastructure",
    label: "Infrastruktura serwera",
    description:
      "VPS, DNS, snapshoty, backupy, monitoring zasobów, bezpieczeństwo/SIEM, Wazuh dashboard (panel /admin/infrastructure + https://wazuh.myperformance.pl).",
    provider: "keycloak-only",
    icon: "Server",
    nativeAdminUrl: nativeUrl(
      "NEXT_PUBLIC_WAZUH_URL",
      "https://wazuh.myperformance.pl",
    ),
    kcRoles: [
      {
        name: "infrastructure_admin",
        label: "Administrator",
        description:
          "Pełny dostęp: OVH API (VPS, DNS, snapshot, backup), monitoring zasobów (CPU/RAM/Disk per kontener), security events, blokady IP, Wazuh SIEM (agenty, reguły, polityki, użytkownicy).",
        priority: 90,
      },
      // Wazuh OpenSearch Dashboards mapuje rolę `wazuh_admin` → all_access
      // przez roles_mapping.yml. Trzymamy ją jako drugi alias w tej samej
      // area — kc-sync nadaje wszystkim infrastructure adminom OBIE role,
      // dzięki temu Wazuh OIDC login działa bez osobnej area.
      {
        name: "wazuh_admin",
        label: "Wazuh OpenSearch (alias)",
        description:
          "Mapuje na all_access w Wazuh OpenSearch Dashboards (roles_mapping.yml). Auto-przypisywane razem z infrastructure_admin.",
        priority: 90,
      },
    ],
  },
  {
    id: "config-hub",
    label: "Zarządzanie konfiguracją",
    description:
      "Centralna konfiguracja: punkty sprzedaży/serwisu, certyfikaty mTLS, powiązania, grupy targetowe i progi punktowe (panel /admin/config).",
    provider: "keycloak-only",
    icon: "Settings",
    kcRoles: [
      {
        name: "config_admin",
        label: "Administrator",
        description:
          "Pełny dostęp do panelu Zarządzanie konfiguracją: edycja punktów, grup targetowych, progów, powiązań cert↔punkt.",
        priority: 90,
      },
    ],
  },
  {
    id: "email-admin",
    label: "Email — centralne zarządzanie",
    description: "Branding, szablony Keycloak, Postal admin, catalog (panel /admin/email).",
    provider: "keycloak-only",
    icon: "Mail",
    kcRoles: [
      {
        name: "email_admin",
        label: "Administrator",
        description:
          "Zarządzanie centralnym brandingiem, szablonami KC, Postal, mass-send.",
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

/**
 * Walidacja seeda roli — fail-closed. Zwraca string z błędem albo null.
 */
function validateRoleSeed(
  raw: unknown,
  ctx: string,
): { ok: true; role: AreaRoleSeed } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: `${ctx}: role is not an object` };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || r.name.length === 0) {
    return { ok: false, error: `${ctx}: role.name must be non-empty string` };
  }
  if (typeof r.label !== "string" || r.label.length === 0) {
    return { ok: false, error: `${ctx}: role.label must be non-empty string` };
  }
  if (typeof r.description !== "string") {
    return { ok: false, error: `${ctx}: role.description must be string` };
  }
  if (typeof r.priority !== "number" || !Number.isFinite(r.priority) || r.priority <= 0) {
    return { ok: false, error: `${ctx}: role.priority must be positive number` };
  }
  const role: AreaRoleSeed = {
    name: r.name,
    label: r.label,
    description: r.description,
    priority: r.priority,
  };
  if ("nativeRoleId" in r) {
    const v = r.nativeRoleId;
    if (v !== null && v !== undefined && typeof v !== "string") {
      return {
        ok: false,
        error: `${ctx}: role.nativeRoleId must be string|null|undefined`,
      };
    }
    role.nativeRoleId = (v as string | null | undefined) ?? null;
  }
  return { ok: true, role };
}

/**
 * Walidacja pojedynczej area + materializacja `nativeAdminUrl` z env.
 */
function materializeArea(
  raw: unknown,
  idx: number,
): { ok: true; area: PermissionArea } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: `areas[${idx}]: not an object` };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0) {
    return { ok: false, error: `areas[${idx}]: id must be non-empty string` };
  }
  if (typeof r.label !== "string" || r.label.length === 0) {
    return { ok: false, error: `areas[${idx}]: label must be non-empty string` };
  }
  if (typeof r.description !== "string") {
    return { ok: false, error: `areas[${idx}]: description must be string` };
  }
  if (r.provider !== "keycloak-only" && r.provider !== "native") {
    return {
      ok: false,
      error: `areas[${idx}]: provider must be "keycloak-only" or "native"`,
    };
  }
  if (!Array.isArray(r.kcRoles) || r.kcRoles.length === 0) {
    return { ok: false, error: `areas[${idx}]: kcRoles must be non-empty array` };
  }

  const kcRoles: AreaRoleSeed[] = [];
  for (let i = 0; i < r.kcRoles.length; i++) {
    const res = validateRoleSeed(r.kcRoles[i], `areas[${idx}]:${r.id}.kcRoles[${i}]`);
    if (!res.ok) return res;
    kcRoles.push(res.role);
  }

  const area: PermissionArea = {
    id: r.id,
    label: r.label,
    description: r.description,
    provider: r.provider,
    kcRoles,
  };
  if (typeof r.nativeProviderId === "string" && r.nativeProviderId.length > 0) {
    area.nativeProviderId = r.nativeProviderId;
  }
  if (typeof r.icon === "string" && r.icon.length > 0) {
    area.icon = r.icon;
  }
  if (r.dynamicRoles === true) {
    area.dynamicRoles = true;
  }

  // Resolve nativeAdminUrl z (env, fallback, tail) — z fallbackiem na
  // bezpośrednie pole `nativeAdminUrl` jeżeli ktoś go nadał na sztywno
  // w JSON (back-compat).
  if (typeof r.nativeAdminUrl === "string" && r.nativeAdminUrl.length > 0) {
    area.nativeAdminUrl = r.nativeAdminUrl;
  } else if (
    typeof r.nativeAdminUrlFallback === "string" &&
    r.nativeAdminUrlFallback.length > 0
  ) {
    const envName =
      typeof r.nativeAdminUrlEnv === "string" ? r.nativeAdminUrlEnv : "";
    const tail =
      typeof r.nativeAdminUrlTail === "string" ? r.nativeAdminUrlTail : "";
    area.nativeAdminUrl = nativeUrl(envName, r.nativeAdminUrlFallback, tail);
  }

  return { ok: true, area };
}

/**
 * Próbuje załadować `config/areas.json` przez różne strategie:
 *  1. Statyczny ESM-import (resolveJsonModule) — działa w Next.js bundler
 *     i w vitest gdy plik istnieje pod ścieżką @/config/areas.json.
 *  2. Node CJS require z absolutną ścieżką resolved przez `process.cwd()`
 *     — fallback gdy bundler nie inline-uje JSON (test runtime, dev server).
 *  3. Filesystem read przez `fs.readFileSync` — last resort.
 *
 * Wszystkie ścieżki opakowane w try/catch — fail-closed na DEFAULT_AREAS.
 */
function readRawAreasJson(): unknown | null {
  // Strategia 1 — static ESM import (Next.js bundler, vitest z resolve.alias)
  try {
    // Inline static import — TypeScript widzi to jako require z aliasem @/.
    // Vitest CJS resolver może to odrzucić; Next.js bundler inlinuje JSON.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/config/areas.json");
    if (mod && typeof mod === "object") {
      // ESM JSON może być pod default, CJS pod root.
      return (mod as { default?: unknown }).default ?? mod;
    }
  } catch {
    // ignore — try next strategy
  }

  // Strategia 2 — fs.readFileSync z absolutną ścieżką wyliczoną z cwd.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const candidates = [
      path.resolve(process.cwd(), "config", "areas.json"),
      path.resolve(__dirname, "..", "..", "config", "areas.json"),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const text = fs.readFileSync(p, "utf-8");
          return JSON.parse(text);
        }
      } catch {
        // try next candidate
      }
    }
  } catch {
    // fs/path not available — Edge runtime?
  }

  return null;
}

/**
 * Główny loader — czyta `config/areas.json`, waliduje, materializuje
 * URL-e. Fail-closed: jeśli cokolwiek pójdzie źle → fallback na
 * `DEFAULT_AREAS` + console.warn.
 */
export function loadAreasConfig(): PermissionArea[] {
  const raw = readRawAreasJson();
  if (raw === null) {
    if (typeof console !== "undefined") {
      console.warn(
        "[areas] failed to load config/areas.json (no strategy succeeded) — falling back to DEFAULT_AREAS",
      );
    }
    return DEFAULT_AREAS;
  }

  if (typeof raw !== "object" || raw === null) {
    if (typeof console !== "undefined") {
      console.warn(
        "[areas] config/areas.json: root must be object — falling back to DEFAULT_AREAS",
      );
    }
    return DEFAULT_AREAS;
  }

  const file = raw as RawAreasFile;
  if (!Array.isArray(file.areas) || file.areas.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(
        "[areas] config/areas.json: `areas` must be non-empty array — falling back to DEFAULT_AREAS",
      );
    }
    return DEFAULT_AREAS;
  }

  const out: PermissionArea[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < file.areas.length; i++) {
    const res = materializeArea(file.areas[i], i);
    if (!res.ok) {
      if (typeof console !== "undefined") {
        console.warn(
          `[areas] config/areas.json invalid: ${res.error} — falling back to DEFAULT_AREAS`,
        );
      }
      return DEFAULT_AREAS;
    }
    if (seenIds.has(res.area.id)) {
      if (typeof console !== "undefined") {
        console.warn(
          `[areas] config/areas.json: duplicate area id "${res.area.id}" — falling back to DEFAULT_AREAS`,
        );
      }
      return DEFAULT_AREAS;
    }
    seenIds.add(res.area.id);
    out.push(res.area);
  }
  return out;
}

/**
 * Zarejestrowane areas — wynik `loadAreasConfig()` przy module init.
 *
 * Kontrakt API jest niezmieniony — kod konsumujący `AREAS` jako
 * `PermissionArea[]` nie wymaga modyfikacji. Reload wymaga restartu
 * aplikacji (Next.js server) — config jest cache'owany przez require.
 */
export const AREAS: PermissionArea[] = loadAreasConfig();

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
 * Eksport DEFAULT_AREAS dla testów (sprawdzić że fallback działa).
 * @internal
 */
export const __DEFAULT_AREAS_FOR_TESTS: PermissionArea[] = DEFAULT_AREAS;

/**
 * Eksport walidatorów dla testów config-driven loading.
 * @internal
 */
export const __INTERNAL_FOR_TESTS = {
  materializeArea,
  validateRoleSeed,
};
