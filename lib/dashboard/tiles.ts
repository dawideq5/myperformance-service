/**
 * Dashboard tile registry — single source of truth dla kafelków na
 * `/dashboard`. Wave 1 (Faza 4): czysty config jako data, bez podpięcia
 * do `DashboardClient.tsx` (to robi wave 3).
 *
 * Każdy `TileConfig` deklaruje warunki widoczności jako data — albo poprzez
 * `visibility` (areaId + min priority), albo `visibilityAny` (OR-semantyka
 * gdy tile jest wyświetlany przy dowolnej z kilku ról), albo brak (tile
 * widoczny dla wszystkich zalogowanych userów).
 *
 * Dlaczego data zamiast funkcji predykatu:
 *  - data jest serialized-friendly (można dump'ować do Directusa w wave 2),
 *  - wszystkie checki przechodzą przez `hasArea` z `admin-auth.ts` (jeden
 *    code-path, zero duplikacji logiki),
 *  - nowy tile = nowy wpis w tej tablicy + (opcjonalnie) wpis w
 *    `app-catalog.ts` — żadnego JSX'a w DashboardClient.
 */

import type { PermissionArea } from "@/lib/permissions/areas";

export type TileCategory = "core" | "admin" | "integrations" | "panels";

export interface TileVisibility {
  /** id z `AREAS` (np. "documenso", "infrastructure"). */
  areaId: PermissionArea["id"];
  /** Minimum role priority — 10=user, 50=manager, 90=admin. */
  min: number;
}

export interface TileConfig {
  /** Stabilne id (używane przez tour, analytics, hooki). */
  id: string;
  /** PL label widoczny na kafelku. */
  label: string;
  /** PL opis (pod labelem). Optional — niektóre tile'e mają per-priority
   * opis dynamiczny (np. Documenso). Dla tych zostawiamy puste i logika
   * w consumerze wybiera tekst. */
  description?: string;
  /** URL — local (/admin/...) lub external (https://...) lub launcher
   * (/api/.../sso, /api/.../launch). */
  href: string;
  /** Nazwa ikony z `lucide-react` (string żeby tile config był serializable). */
  icon: string;
  /** Kategoria — używana do grupowania w UI (Wave 3 może rozdzielić
   * sekcje "Aplikacje" / "Administracja"). */
  category: TileCategory;
  /** Tailwind classes dla bg ikony. */
  iconBgClass?: string;
  /** Tailwind classes dla samej ikony (kolor). */
  iconColorClass?: string;
  /** id dla `data-tour-tile` (intro.js). Default = `id`. */
  tourId?: string;

  /**
   * AND-semantyka dla widoczności. Tile pokazuje się tylko gdy session ma
   * rolę z `areaId` o priority >= `min`.
   *
   * NULL → tile widoczny dla każdego zalogowanego usera (bez gatingu).
   */
  visibility?: TileVisibility;

  /**
   * OR-semantyka — tile widoczny gdy session spełnia DOWOLNY z warunków.
   * Używane dla compound checks (np. ConfigHub: certs OR keycloak admin).
   *
   * Mutually exclusive z `visibility`.
   */
  visibilityAny?: TileVisibility[];

  /** Czy tile wymaga client cert (mTLS). Tylko informacyjnie — gating po
   * stronie reverse-proxy/Traefik. UI może pokazać badge "wymaga cert". */
  certGated?: boolean;

  /**
   * Czy URL jest external i otwierany w nowej karcie. Dla launcherów
   * (`/api/<svc>/launch`) zachowanie zależy od `sameTab`.
   */
  external?: boolean;

  /**
   * Gdy `true` (i tile jest external), otwiera w tej samej karcie. Default:
   * external tile'e otwierają w nowej karcie (`window.open(_blank)`).
   */
  sameTab?: boolean;

  /**
   * Provider id z `PROVIDER_REGISTRY` — używane przez Cmd+K palette do
   * weryfikacji "czy backend integration jest skonfigurowana". Optional.
   */
  providerId?: string;
}

/**
 * REGISTRY — kolejność jest istotna (renderuje się w tej kolejności
 * w grid'zie). Trzymamy zgrupowane wg kategorii dla czytelności.
 */
export const DASHBOARD_TILES: TileConfig[] = [
  // ─── Core (każdy zalogowany) ────────────────────────────────────────────
  {
    id: "calendar",
    label: "Kalendarz",
    description: "Twoje wydarzenia, Google Calendar, Kadromierz",
    href: "/dashboard/calendar",
    icon: "Calendar",
    category: "core",
    iconBgClass: "bg-blue-500/10",
    iconColorClass: "text-blue-500",
    tourId: "calendar",
  },
  {
    id: "kadromierz",
    label: "Kadromierz",
    description: "Grafik pracy i ewidencja czasu",
    href: "/account?tab=integrations",
    icon: "Clock",
    category: "core",
    iconBgClass: "bg-orange-500/10",
    iconColorClass: "text-orange-500",
    tourId: "kadromierz",
    visibility: { areaId: "kadromierz", min: 10 },
  },

  // ─── Panels (cert-gated, mTLS) ──────────────────────────────────────────
  {
    id: "panel-sprzedawca",
    label: "Panel Sprzedawcy",
    description: "Oferty, zamówienia, klienci",
    href: "/panel/sprzedawca/launch",
    icon: "Briefcase",
    category: "panels",
    iconBgClass: "bg-sky-500/10",
    iconColorClass: "text-sky-500",
    tourId: "panel-sprzedawca",
    visibility: { areaId: "panel-sprzedawca", min: 10 },
    certGated: true,
    external: true,
  },
  {
    id: "panel-serwisant",
    label: "Panel Serwisanta",
    description: "Zgłoszenia serwisowe i naprawy",
    href: "/panel/serwisant/launch",
    icon: "Wrench",
    category: "panels",
    iconBgClass: "bg-rose-500/10",
    iconColorClass: "text-rose-500",
    tourId: "panel-serwisant",
    visibility: { areaId: "panel-serwisant", min: 10 },
    certGated: true,
    external: true,
  },
  {
    id: "panel-kierowca",
    label: "Panel Kierowcy",
    description: "Trasy, dostawy, pojazdy",
    href: "/panel/kierowca/launch",
    icon: "Truck",
    category: "panels",
    iconBgClass: "bg-lime-500/10",
    iconColorClass: "text-lime-500",
    tourId: "panel-kierowca",
    visibility: { areaId: "panel-kierowca", min: 10 },
    certGated: true,
    external: true,
  },

  // ─── Admin (cert-gated configurations) ──────────────────────────────────
  {
    id: "certificates",
    label: "Certyfikaty klienckie",
    description: "Zarządzanie certyfikatami dostępu do paneli",
    href: "/admin/certificates",
    icon: "FileSignature",
    category: "admin",
    iconBgClass: "bg-amber-500/10",
    iconColorClass: "text-amber-500",
    tourId: "certs",
    visibility: { areaId: "certificates", min: 90 },
  },
  {
    id: "config",
    label: "Zarządzanie konfiguracją",
    description: "Punkty + certyfikaty + powiązania + grupy targetowe",
    href: "/admin/config",
    icon: "Settings",
    category: "admin",
    iconBgClass: "bg-violet-500/10",
    iconColorClass: "text-violet-500",
    tourId: "config",
    // Compound: configHub OR certs admin OR keycloak admin
    // (mirrors `canAccessConfigHub` w admin-auth.ts).
    visibilityAny: [
      { areaId: "config-hub", min: 90 },
      { areaId: "certificates", min: 90 },
      { areaId: "keycloak", min: 90 },
    ],
  },

  // ─── Integrations (native apps via SSO) ─────────────────────────────────
  {
    id: "directus",
    label: "Directus",
    description: "Zarządzanie treścią i danymi aplikacji (SSO)",
    href: "/api/directus/launch",
    icon: "Database",
    category: "integrations",
    iconBgClass: "bg-emerald-500/10",
    iconColorClass: "text-emerald-500",
    tourId: "directus",
    visibility: { areaId: "directus", min: 90 },
    external: true,
    providerId: "directus",
  },
  {
    id: "documenso",
    label: "Dokumenty",
    // description left undefined — DashboardClient renderuje per-priority text
    href: "/api/documenso/sso",
    icon: "FileSignature",
    category: "integrations",
    iconBgClass: "bg-purple-500/10",
    iconColorClass: "text-purple-500",
    tourId: "documenso",
    visibility: { areaId: "documenso", min: 10 },
    external: true,
    providerId: "documenso",
  },
  {
    id: "chatwoot",
    label: "Chatwoot",
    href: "/api/chatwoot/sso",
    icon: "MessageSquare",
    category: "integrations",
    iconBgClass: "bg-sky-500/10",
    iconColorClass: "text-sky-500",
    tourId: "chatwoot",
    visibility: { areaId: "chatwoot", min: 10 },
    external: true,
    providerId: "chatwoot",
  },
  {
    id: "postal",
    label: "Postal",
    description: "Serwer pocztowy — transakcyjne i newslettery",
    href: "https://postal.myperformance.pl",
    icon: "Mail",
    category: "integrations",
    iconBgClass: "bg-pink-500/10",
    iconColorClass: "text-pink-500",
    tourId: "postal",
    visibility: { areaId: "postal", min: 90 },
    external: true,
    providerId: "postal",
  },
  {
    id: "moodle",
    label: "MyPerformance — Akademia",
    href: "/api/moodle/launch",
    icon: "GraduationCap",
    category: "integrations",
    iconBgClass: "bg-amber-500/10",
    iconColorClass: "text-amber-500",
    tourId: "moodle",
    visibility: { areaId: "moodle", min: 10 },
    external: true,
    providerId: "moodle",
  },
  {
    id: "knowledge",
    label: "Baza wiedzy",
    description: "Procedury, zasady, how-to — wewnętrzna wiki zespołu (Outline)",
    href: "/api/outline/launch",
    icon: "BookMarked",
    category: "integrations",
    iconBgClass: "bg-teal-500/10",
    iconColorClass: "text-teal-400",
    tourId: "knowledge",
    visibility: { areaId: "knowledge", min: 10 },
    external: true,
    providerId: "outline",
  },

  // ─── Admin (IAM + ops) ──────────────────────────────────────────────────
  {
    id: "users",
    label: "Użytkownicy",
    description:
      "Zarządzanie użytkownikami i precyzyjne przypisywanie ról per panel (Keycloak SoT)",
    href: "/admin/users",
    icon: "Users",
    category: "admin",
    iconBgClass: "bg-indigo-500/10",
    iconColorClass: "text-indigo-500",
    tourId: "users",
    visibility: { areaId: "keycloak", min: 90 },
  },
  {
    id: "email",
    label: "Email i branding",
    description:
      "Centralny panel: branding, szablony Keycloak, Postal (serwery/skrzynki/domeny), test send",
    href: "/admin/email",
    icon: "Mail",
    category: "admin",
    iconBgClass: "bg-indigo-500/10",
    iconColorClass: "text-indigo-500",
    tourId: "email",
    visibility: { areaId: "email-admin", min: 90 },
  },
  {
    id: "infrastructure",
    label: "Infrastruktura serwera",
    description:
      "VPS, DNS, snapshoty, backupy, monitoring zasobów (CPU/RAM/Disk), alerty bezpieczeństwa, blokady IP, Wazuh SIEM",
    href: "/admin/infrastructure",
    icon: "Server",
    category: "admin",
    iconBgClass: "bg-indigo-500/10",
    iconColorClass: "text-indigo-500",
    tourId: "infrastructure",
    visibility: { areaId: "infrastructure", min: 90 },
  },
  {
    id: "livekit",
    label: "LiveKit",
    description:
      "Aktywne konsultacje video — podgląd, dołączenie, zakończenie",
    href: "/admin/livekit",
    icon: "Video",
    category: "admin",
    iconBgClass: "bg-rose-500/10",
    iconColorClass: "text-rose-500",
    tourId: "livekit",
    visibility: { areaId: "infrastructure", min: 90 },
  },
  {
    id: "keycloak",
    label: "Keycloak (konsola IdP)",
    description:
      "Natywna konsola administracyjna Keycloak — realms, klienci, IdP, polityki",
    href: "/admin/keycloak",
    icon: "KeyRound",
    category: "admin",
    iconBgClass: "bg-indigo-500/10",
    iconColorClass: "text-indigo-500",
    tourId: "keycloak",
    visibility: { areaId: "keycloak", min: 90 },
    external: true,
  },
];

/**
 * Lookup po id. Returns null gdy nie ma takiego tile'a.
 */
export function getTileById(id: string): TileConfig | null {
  return DASHBOARD_TILES.find((t) => t.id === id) ?? null;
}

/**
 * Wszystkie tile'e w danej kategorii (zachowuje kolejność z DASHBOARD_TILES).
 */
export function tilesByCategory(category: TileCategory): TileConfig[] {
  return DASHBOARD_TILES.filter((t) => t.category === category);
}
