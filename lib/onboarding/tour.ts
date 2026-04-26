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
