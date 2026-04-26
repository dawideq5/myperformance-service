/**
 * Definicje tras przewodnika (branded Tour, components/ui/Tour.tsx).
 * Body i more są template literals (backticki) zeby polskie cudzysłowy
 * nie kolidowały z parserem TS.
 */

import { userHasAreaClient } from "@/lib/permissions/access-client";

export interface TourStep {
  element?: string;
  title: string;
  body: string;
  more?: string;
  allowInteraction?: boolean;
}

export interface TourDefinition {
  id: string;
  label: string;
  requiresArea?: string;
  steps: TourStep[];
}

export const TOURS: Record<string, TourDefinition> = {
  account: {
    id: "account",
    label: "Konto",
    steps: [
      {
        title: `Witaj w sekcji Konto`,
        body: `Tu zarządzasz wszystkim co jest „o Tobie”. Pokażę Ci 4 najważniejsze zakładki — w każdej możesz w trakcie tour kliknąć i sprawdzić, jak działa.`,
      },
      {
        element: '[data-tour="tab-security"]',
        title: `Włącz 2FA — kliknij zakładkę`,
        body: `Klik = przeskoczysz do sekcji bezpieczeństwo. Tam włączysz aplikację uwierzytelniającą (TOTP) lub klucz sprzętowy (WebAuthn). Po kliknięciu wróć do tour i naciśnij „Dalej”.`,
        more: `WebAuthn (Touch ID, Windows Hello, klucz YubiKey) jest odporny na phishing. TOTP (Google Authenticator) działa offline. Możesz mieć obie naraz.`,
      },
      {
        element: '[data-tour="tab-sessions"]',
        title: `Sprawdź swoje aktywne sesje`,
        body: `Każde urządzenie z którego się logowałeś ma tu wpis. Kliknij — zobaczysz listę i przyciski „Wyloguj”. Jeśli widzisz nieznane urządzenie, wyloguj sesję i zmień hasło.`,
      },
      {
        element: '[data-tour="tab-preferences"]',
        title: `Skonfiguruj powiadomienia`,
        body: `Ostatnia zakładka, w której jesteś teraz. Tu włączasz wskazówki w panelach (te kolorowe karty) oraz wybierasz dla każdego zdarzenia czy chcesz powiadomienie w pulpicie, email, czy oba.`,
        more: `Krytyczne alerty bezpieczeństwa (zmiana hasła, nieudane logowanie z nowego IP, brute-force) wysyłają email niezależnie od ustawień.`,
      },
    ],
  },

  "admin-infrastructure": {
    id: "admin-infrastructure",
    label: "Infrastruktura",
    requiresArea: "infrastructure",
    steps: [
      {
        title: `Zaczynamy w Infrastrukturze`,
        body: `8 zakładek pokrywa wszystko co dotyczy serwera fizycznego i bezpieczeństwa. Pokażę najważniejsze — możesz w trakcie tour klikać taby i sprawdzać.`,
      },
      {
        element: '[data-tour="tab-vps"]',
        title: `Backup VPS w 2 klikach`,
        body: `Tab VPS — przycisk „Wykonaj snapshot” wyzwala migawkę całego systemu (OVH, ~3-5 min). Dobry zwyczaj: snapshot przed dużymi zmianami.`,
        more: `OVH trzyma maks 1 aktywny snapshot per VPS. Następny nadpisze poprzedni — jest opcja „Wymuś nadpisanie”.`,
      },
      {
        element: '[data-tour="tab-blocks"]',
        title: `Threat Intel — blokady IP`,
        body: `Klik = lista wszystkich zablokowanych IP (Wazuh AR + ręczne). Filtry po kraju, risk score, urządzeniu. Bulk-unblock na dole tabeli.`,
        more: `Risk score liczony na podstawie: liczba zdarzeń, geo (lista wysokiego ryzyka), powiązania z udanymi logowaniami innych userów.`,
      },
      {
        element: '[data-tour="tab-map"]',
        title: `Mapa świata + timeline`,
        body: `Każde zdarzenie ma geolokację. Mapa pokaże skupiska ataków. Klik na region = filtr timeline tylko po nim.`,
      },
    ],
  },

  "admin-email": {
    id: "admin-email",
    label: "Email",
    requiresArea: "email-admin",
    steps: [
      {
        title: `Centrum email — wszystko w jednym miejscu`,
        body: `Szablony Keycloak, branding wszystkich apek, konfiguracje SMTP, panel Postal. Pokażę 2 najważniejsze taby.`,
      },
      {
        element: '[data-tour="tab-templates"]',
        title: `Edycja szablonu z podglądem`,
        body: `Klik = lista szablonów (login, password reset, verify email, brute-force alert). Każdy ma edytor + podgląd na żywo + przycisk „Test send” do siebie.`,
      },
      {
        element: '[data-tour="tab-branding"]',
        title: `Branding propaguje się stack-wide`,
        body: `Zmiana logo / accent color / footera w tym tabie automatycznie idzie do Keycloaka, Postal, szablonów aplikacyjnych.`,
      },
    ],
  },
};

export function getTour(id: string): TourDefinition | null {
  return TOURS[id] ?? null;
}

interface AppKafelek {
  selector: string;
  area?: string;
  title: string;
  body: string;
  more?: string;
}

const DASHBOARD_TILES: AppKafelek[] = [
  {
    selector: '[data-tour-tile="calendar"]',
    area: "core",
    title: `Otwórz Kalendarz`,
    body: `Klik na kafelek pokaże Ci timeline z 4 źródeł na raz: Twoje wydarzenia + Google + Kadromierz (grafik) + Akademia (terminy kursów). Wszystko w jednym widoku.`,
  },
  {
    selector: '[data-tour-tile="kadromierz"]',
    area: "kadromierz",
    title: `Kadromierz — grafik pracy`,
    body: `Tutaj widzisz swój planowany czas pracy. Jeśli kafelek pokazuje „Skonfiguruj” — kliknij i podaj klucz API od HR.`,
  },
  {
    selector: '[data-tour-tile="panel-sprzedawca"]',
    area: "panel-sprzedawca",
    title: `Panel Sprzedawcy`,
    body: `Otwiera się pod osobną domeną z wymaganym certyfikatem mTLS. Jeśli go jeszcze nie masz — w Certyfikatach klienckich możesz poprosić.`,
    more: `Cert = paczka .p12 którą importujesz raz do przeglądarki. Po imporcie panel widoczny jest tylko z tego urządzenia.`,
  },
  {
    selector: '[data-tour-tile="panel-serwisant"]',
    area: "panel-serwisant",
    title: `Panel Serwisanta`,
    body: `Zgłoszenia serwisowe i naprawy. Wymaga certyfikatu mTLS (jak wszystkie panele zewnętrzne).`,
  },
  {
    selector: '[data-tour-tile="panel-kierowca"]',
    area: "panel-kierowca",
    title: `Panel Kierowcy`,
    body: `Trasy, dostawy, pojazdy. Mobile-first, działa na telefonie po imporcie certyfikatu.`,
  },
  {
    selector: '[data-tour-tile="certs"]',
    area: "certificates",
    title: `Certyfikaty klienckie`,
    body: `Wystawisz tu certyfikaty mTLS dla siebie i innych. Każdy wystawiony cert = jedno upoważnienie do panelu (sprzedawca / serwisant / kierowca). Możesz je revoke w każdej chwili.`,
  },
  {
    selector: '[data-tour-tile="directus"]',
    area: "directus",
    title: `Directus — headless CMS`,
    body: `Treść strony, kolekcje danych, API. Klik = przeniesienie z auto-loginem (SSO).`,
  },
  {
    selector: '[data-tour-tile="documenso"]',
    area: "documenso",
    title: `Documenso — podpisy elektroniczne`,
    body: `Wyślij dokument do podpisu lub podpisz coś co dostałeś. Kliknij kafelek, zaloguje Cię od razu (SSO).`,
  },
  {
    selector: '[data-tour-tile="chatwoot"]',
    area: "chatwoot",
    title: `Chatwoot — live chat z klientem`,
    body: `Inbox z wszystkich kanałów (web, email, social). Jeśli zostaniesz przypisany do rozmowy — dostaniesz powiadomienie w pulpicie.`,
  },
  {
    selector: '[data-tour-tile="postal"]',
    area: "postal",
    title: `Postal (admin)`,
    body: `Niskopoziomowe zarządzanie serwerem mail: organizacje, domeny, DKIM/SPF, kolejka. Dla większości spraw lepiej iść w „Email i branding”.`,
  },
  {
    selector: '[data-tour-tile="moodle"]',
    area: "moodle",
    title: `Akademia (Moodle)`,
    body: `Twoje kursy, oceny, terminy. Kliknij — automatyczne logowanie. Jeśli nigdy się nie zalogowałeś, konto utworzy się przy pierwszym wejściu.`,
  },
  {
    selector: '[data-tour-tile="knowledge"]',
    area: "knowledge",
    title: `Baza wiedzy (Outline)`,
    body: `Wewnętrzna wiki — procedury, how-to, runbooks. Możesz edytować jeśli masz rolę Editor. Dobre pierwsze miejsce gdy coś nie wiesz „jak się robi w MyPerformance”.`,
  },
  {
    selector: '[data-tour-tile="users"]',
    area: "keycloak",
    title: `Użytkownicy — IAM`,
    body: `Tu zapraszasz nowych ludzi, dajesz im role per aplikacja, zarządzasz grupami. Keycloak jest source of truth — usunięcie tu propaguje się do wszystkich apek.`,
  },
  {
    selector: '[data-tour-tile="email"]',
    area: "email-admin",
    title: `Email i branding`,
    body: `Wszystkie maile wysyłane przez stack — szablony, branding, SMTP, Postal infrastruktura. Sub-tour „Centrum email” pokaże szczegóły.`,
  },
  {
    selector: '[data-tour-tile="infrastructure"]',
    area: "infrastructure",
    title: `Infrastruktura serwera`,
    body: `VPS, snapshoty, monitoring zasobów, IP blocks, mapa zdarzeń, Wazuh SIEM. Sub-tour pokaże 4 najważniejsze widoki.`,
  },
  {
    selector: '[data-tour-tile="keycloak"]',
    area: "keycloak",
    title: `Keycloak (natywna konsola)`,
    body: `Pełen dostęp do realmów, klientów OIDC, federacji, polityk. Otwiera natywną apkę KC.`,
  },
];

export function buildFullSystemTour(roles: string[]): TourDefinition {
  const accessibleTiles = DASHBOARD_TILES.filter(
    (t) => !t.area || userHasAreaClient(roles, t.area),
  );

  const steps: TourStep[] = [
    {
      title: `Pełny przewodnik po MyPerformance`,
      body: `Pokażę Ci tylko aplikacje, do których masz dostęp. Każdy krok zawiera podpowiedź — możesz w trakcie kliknąć kafelek żeby sprawdzić, co tam jest, i wrócić do tour przyciskiem „Dalej”.`,
    },
    ...accessibleTiles.map<TourStep>((t) => ({
      element: t.selector,
      title: t.title,
      body: t.body,
      more: t.more,
    })),
    {
      element: '[data-tour="cmdk-button"]',
      title: `Cmd+K — przeskocz dokąd chcesz`,
      body: `Najszybszy sposób nawigacji. Wpisz fragment nazwy panelu (np. „infra”, „blocks”, „2fa”) albo email użytkownika — Enter przeskakuje. Wyszukiwarka pokazuje TYLKO opcje do których masz dostęp.`,
    },
    {
      element: '[data-tour="bell"]',
      title: `Powiadomienia w pulpicie`,
      body: `Tu wpadają zdarzenia z całego systemu. Klik = rozwinie listę. Czerwony badge = liczba nieprzeczytanych. Powiadomienia per-event konfigurujesz w Preferencjach.`,
    },
    {
      element: '[data-tour="theme-toggle"]',
      title: `Tryb jasny / ciemny`,
      body: `Klik = animacja kosmiczna pod kafelkami (kamera okrąża Ziemię w stronę słońca albo księżyca). Wybór zapamiętuje się PER URZĄDZENIE — możesz mieć ciemny w pracy i jasny w domu.`,
    },
    {
      element: '[data-tour="account-link"]',
      title: `Twoje konto`,
      body: `Profil, hasło, 2FA, sesje, integracje. Tu też uruchomisz ten przewodnik ponownie albo per panel.`,
    },
    {
      title: `Gotowe — eksploruj system`,
      body: `Każdy panel ma własny mini-przewodnik dostępny w jego nagłówku. Kliknij dowolny kafelek żeby zacząć. Powodzenia!`,
    },
  ];

  return {
    id: "full-system",
    label: "Pełny przewodnik",
    steps,
  };
}
