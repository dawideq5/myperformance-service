/**
 * Konfiguracja kroków intro.js per panel.
 *
 * Klucz = stabilny identyfikator panelu (ścieżka aplikacji), wartość =
 * lista kroków. Każdy krok celuje w element przez `[data-tour="<id>"]`,
 * więc tour nie psuje się przy refaktorze klas Tailwind.
 *
 * Użycie:
 *
 *   import { runTour } from "@/lib/onboarding/runner";
 *   runTour("dashboard");
 *
 * Postępy są zapisywane w `prefs.introCompletedSteps` (PATCH
 * /api/account/preferences) — kolejne odpalenie tej samej trasy nie
 * pokazuje już ukończonych kroków, chyba że user resetuje z Preferencji.
 */

export type TourPosition =
  | "floating"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-right-aligned"
  | "top-left-aligned"
  | "top-middle-aligned"
  | "bottom-right-aligned"
  | "bottom-left-aligned"
  | "bottom-middle-aligned";

export interface TourStep {
  /** `[data-tour="<element>"]` na stronie. */
  element?: string;
  /** Tytuł kroku — Polish UI. */
  title: string;
  /** Treść (HTML allowed, ale trzymaj prostą). */
  intro: string;
  /** intro.js v8 position. */
  position?: TourPosition;
}

export interface TourDefinition {
  id: string;
  label: string;
  /** Area required — pokazuj kursor tylko jeśli user ma dostęp. */
  requiresArea?: string;
  steps: TourStep[];
}

export const TOURS: Record<string, TourDefinition> = {
  dashboard: {
    id: "dashboard",
    label: "Pulpit",
    steps: [
      {
        title: "Witaj w MyPerformance",
        intro:
          "To jest Twój pulpit — centralne miejsce do nawigacji po aplikacjach: Chatwoot, Documenso, Moodle, Outline, Directus, Postal i panelach administracyjnych.",
      },
      {
        element: '[data-tour="tile-grid"]',
        title: "Kafelki aplikacji",
        intro:
          "Każdy kafelek prowadzi do natywnej apki z auto-loginem przez SSO. Widzisz tylko te, do których masz uprawnienia.",
        position: "bottom",
      },
      {
        element: '[data-tour="cmdk-button"]',
        title: "Szybkie wyszukiwanie",
        intro:
          "Wciśnij Cmd+K (lub Ctrl+K) żeby otworzyć paletę poleceń — przeszukasz aplikacje, użytkowników i ustawienia z klawiatury.",
        position: "bottom",
      },
      {
        element: '[data-tour="account-link"]',
        title: "Zarządzanie kontem",
        intro:
          "Tu zmienisz dane profilowe, hasło, włączysz 2FA, podłączysz Google Calendar oraz skonfigurujesz powiadomienia i wskazówki.",
        position: "left",
      },
    ],
  },

  account: {
    id: "account",
    label: "Konto",
    steps: [
      {
        title: "Twoje konto",
        intro:
          "Tutaj zarządzasz wszystkim, co dotyczy Ciebie: profilem, bezpieczeństwem, sesjami, integracjami i powiadomieniami.",
      },
      {
        element: '[data-tour="tab-security"]',
        title: "Bezpieczeństwo",
        intro:
          "2FA (TOTP), klucze WebAuthn, zmiana hasła. Włącz 2FA — chroni przed brute-force nawet po wycieku hasła.",
        position: "right",
      },
      {
        element: '[data-tour="tab-sessions"]',
        title: "Aktywne sesje",
        intro:
          "Lista urządzeń zalogowanych na Twoje konto. Możesz wylogować pojedynczą sesję lub wszystkie (poza obecną).",
        position: "right",
      },
      {
        element: '[data-tour="tab-preferences"]',
        title: "Preferencje",
        intro:
          "Włącz/wyłącz wskazówki w panelach, dopasuj powiadomienia (in-app + email) per zdarzenie. Krytyczne alerty bezpieczeństwa zostają zawsze.",
        position: "right",
      },
    ],
  },

  "admin-infrastructure": {
    id: "admin-infrastructure",
    label: "Infrastruktura serwera",
    requiresArea: "infrastructure",
    steps: [
      {
        title: "Infrastruktura",
        intro:
          "Centralny widok stanu serwera: metryki VPS, DNS, Docker stats, snapshoty, blokady IP, mapa zdarzeń i timeline.",
      },
      {
        element: '[data-tour="tab-vps"]',
        title: "VPS",
        intro:
          "Snapshoty OVH (z podglądem ostatnich i 1-click restore), metryki CPU/RAM, status sieci.",
        position: "bottom",
      },
      {
        element: '[data-tour="tab-blocks"]',
        title: "Blokady IP",
        intro:
          "IP zablokowane przez Wazuh AR + ręczne. Filtry: kraj, risk score, urządzenie. Bulk-unblock i podgląd korelacji z userem.",
        position: "bottom",
      },
      {
        element: '[data-tour="tab-map"]',
        title: "Mapa zdarzeń",
        intro:
          "Geolokalizacja zdarzeń bezpieczeństwa na mapie świata. Klik = filter timeline po regionie.",
        position: "bottom",
      },
    ],
  },

  "admin-email": {
    id: "admin-email",
    label: "Email panel",
    requiresArea: "email-admin",
    steps: [
      {
        title: "Centrum email",
        intro:
          "Zarządzanie szablonami KC + Postal + brandingiem + katalogiem maili. Wszystko w jednym miejscu.",
      },
      {
        element: '[data-tour="tab-branding"]',
        title: "Branding",
        intro:
          "Logo, accent color, footer — propaguje się do KC + Postal + szablonów aplikacyjnych.",
        position: "bottom",
      },
      {
        element: '[data-tour="tab-templates"]',
        title: "Szablony KC",
        intro:
          "Edycja Liquid templates używanych przez Keycloak — login, password reset, verify email.",
        position: "bottom",
      },
    ],
  },
};

export function getTour(id: string): TourDefinition | null {
  return TOURS[id] ?? null;
}

interface AppKafelek {
  /** data-tour selektor */
  selector: string;
  area?: string;
  label: string;
  description: string;
}

/**
 * Wszystkie kafelki które MOGĄ pojawić się na dashboardzie. Tour generator
 * filtruje po `area` i `userHasArea(roles, area)` — krok pokazuje się tylko
 * gdy element rzeczywiście jest na stronie.
 */
const DASHBOARD_TILES: AppKafelek[] = [
  { selector: '[data-tour-tile="calendar"]', area: "core", label: "Kalendarz", description: "Twoje wydarzenia + Google Calendar + Kadromierz + Akademia w jednym widoku." },
  { selector: '[data-tour-tile="kadromierz"]', area: "kadromierz", label: "Kadromierz", description: "Grafik pracy i ewidencja czasu." },
  { selector: '[data-tour-tile="panel-sprzedawca"]', area: "panel-sprzedawca", label: "Panel Sprzedawcy", description: "Oferty, zamówienia, klienci. Wymaga certyfikatu mTLS." },
  { selector: '[data-tour-tile="panel-serwisant"]', area: "panel-serwisant", label: "Panel Serwisanta", description: "Zgłoszenia serwisowe i naprawy." },
  { selector: '[data-tour-tile="panel-kierowca"]', area: "panel-kierowca", label: "Panel Kierowcy", description: "Trasy, dostawy, pojazdy." },
  { selector: '[data-tour-tile="certs"]', area: "certificates", label: "Certyfikaty klienckie", description: "Wystawianie + revoke certyfikatów PKCS12 dla paneli." },
  { selector: '[data-tour-tile="directus"]', area: "directus", label: "Directus CMS", description: "Zarządzanie treścią, kolekcje danych, API headless." },
  { selector: '[data-tour-tile="documenso"]', area: "documenso", label: "Documenso", description: "Podpisy elektroniczne dokumentów, organizacje, szablony." },
  { selector: '[data-tour-tile="chatwoot"]', area: "chatwoot", label: "Chatwoot", description: "Live-chat klienta — email, social, web." },
  { selector: '[data-tour-tile="postal"]', area: "postal", label: "Postal", description: "Serwer pocztowy: organizacje, domeny, DKIM, kolejka." },
  { selector: '[data-tour-tile="moodle"]', area: "moodle", label: "Akademia (Moodle)", description: "Kursy, szkolenia, oceny, certyfikaty ukończenia." },
  { selector: '[data-tour-tile="knowledge"]', area: "knowledge", label: "Baza wiedzy (Outline)", description: "Procedury, how-to, wewnętrzna wiki." },
  { selector: '[data-tour-tile="users"]', area: "keycloak", label: "Użytkownicy", description: "Zarządzanie kontami + role per aplikacja (KC = SoT)." },
  { selector: '[data-tour-tile="email"]', area: "email-admin", label: "Email i branding", description: "Centralny panel: szablony, branding, Postal, test send." },
  { selector: '[data-tour-tile="infrastructure"]', area: "infrastructure", label: "Infrastruktura serwera", description: "VPS, DNS, snapshoty, backupy, zasoby, IP blocks, Wazuh SIEM." },
  { selector: '[data-tour-tile="keycloak"]', area: "keycloak", label: "Keycloak (konsola IdP)", description: "Natywna admin konsola — realms, klienci, IdP, polityki." },
];

import { userHasAreaClient } from "@/lib/permissions/access-client";

/**
 * Buduje pełny tour po systemie dynamicznie z user roles. Każdy krok
 * odpowiada jednemu kafelkowi do którego user MA dostęp + uniwersalne
 * elementy (cmdk, dzwonek, theme, account). Element musi istnieć w DOM
 * — intro.js sam pomija krok jeśli selector nie zwraca elementu.
 */
export function buildFullSystemTour(roles: string[]): TourDefinition {
  const accessibleTiles = DASHBOARD_TILES.filter(
    (t) => !t.area || userHasAreaClient(roles, t.area),
  );

  const steps: TourStep[] = [
    {
      title: "Witaj w MyPerformance",
      intro:
        "Pokażę Ci najpierw cały system w pigułce — tylko te aplikacje i panele, do których masz dostęp. Zobaczysz każdy kafelek, dowiesz się co robi i jak się z niego korzysta.",
    },
    ...accessibleTiles.map<TourStep>((t) => ({
      element: t.selector,
      title: t.label,
      intro: t.description,
      position: "bottom" as TourPosition,
    })),
    {
      element: '[data-tour="cmdk-button"]',
      title: "Szybkie wyszukiwanie (Cmd+K)",
      intro:
        "Wpisz fragment nazwy panelu, użytkownika lub IP — przeskoczysz tam jednym Enterem. Z klawiatury obsłużysz cały system bez myszki.",
      position: "bottom",
    },
    {
      element: '[data-tour="bell"]',
      title: "Powiadomienia",
      intro:
        "Tu trafiają zdarzenia z całego systemu — snapshoty, blokady IP, podpisy dokumentów, nowe role. Filtry per kategoria w Preferencjach.",
      position: "bottom",
    },
    {
      element: '[data-tour="theme-toggle"]',
      title: "Tryb jasny / ciemny",
      intro:
        "Klik = animacja przejścia (księżyc ↔ słońce). Wybór zapamiętuje się per urządzenie — możesz mieć ciemny w pracy i jasny w domu.",
      position: "bottom",
    },
    {
      element: '[data-tour="account-link"]',
      title: "Konto",
      intro:
        "Profil, hasło, 2FA, sesje, integracje, logi aktywności i Preferencje (kontrola powiadomień + uruchomienie tego przewodnika ponownie).",
      position: "left",
    },
    {
      title: "Gotowe",
      intro:
        "Kliknij dowolny kafelek żeby wejść w panel — w środku zobaczysz krótki opis, a w niektórych panelach uruchomisz osobny przewodnik z poziomu nagłówka.",
    },
  ];

  return {
    id: "full-system",
    label: "Pełny przewodnik po MyPerformance",
    steps,
  };
}
