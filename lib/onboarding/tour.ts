/**
 * Pojedyncza, dynamiczna trasa: kafelek po kafelku, każdy z opisem
 * tego co znajdziesz WEWNĄTRZ panelu po kliknięciu. Sub-tours per-panel
 * usunięte — jeden zorganizowany flow.
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
  steps: TourStep[];
}

interface AppKafelek {
  selector: string;
  area?: string;
  /** min priority dla widoczności kafelka — match z DashboardClient. */
  minPriority?: number;
  title: string;
  /** Co znajdziesz WEWNĄTRZ panelu (sekcje, akcje, dane). */
  body: string;
  /** Opcjonalna rozszerzona porada — np. case-y, wskazówki. */
  more?: string;
}

const DASHBOARD_TILES: AppKafelek[] = [
  {
    selector: '[data-tour-tile="calendar"]',
    title: `Kalendarz`,
    body: `W środku timeline łączący 4 źródła:
• Twoje wydarzenia (manual add/edit)
• Google Calendar (po podłączeniu konta Google w Integracjach)
• Kadromierz — Twój grafik pracy
• Akademia (Moodle) — terminy kursów i deadline'ów

Możesz dodać event manualnie — fan-out idzie do Google + Moodle automatycznie. Dni z wydarzeniami są podświetlone, klik = lista wydarzeń tego dnia.`,
  },
  {
    selector: '[data-tour-tile="kadromierz"]',
    area: "kadromierz",
    title: `Kadromierz`,
    body: `Po kliknięciu zobaczysz panel z planowanym czasem pracy: dni, godziny, przerwy. Jeśli kafelek pokazuje "Skonfiguruj" — najpierw wprowadź klucz API w Integracjach.

Live widget na dashboardzie pokazuje "ile zostało do końca zmiany" gdy jesteś podłączony.`,
  },
  {
    selector: '[data-tour-tile="panel-sprzedawca"]',
    area: "panel-sprzedawca",
    title: `Panel Sprzedawcy`,
    body: `Otwiera się pod osobną domeną. Wewnątrz: lista ofert, koszyk, klienci, zamówienia z ich statusami, raporty sprzedażowe.

Wymaga certyfikatu mTLS — bez niego przeglądarka pokaże błąd. Cert wystawisz w "Certyfikaty klienckie".`,
  },
  {
    selector: '[data-tour-tile="panel-serwisant"]',
    area: "panel-serwisant",
    title: `Panel Serwisanta`,
    body: `Wewnątrz: lista zgłoszeń serwisowych, status każdego (otwarte/w realizacji/zamknięte), historia napraw klienta, możliwość przypisywania techników.

Wymaga certyfikatu mTLS.`,
  },
  {
    selector: '[data-tour-tile="panel-kierowca"]',
    area: "panel-kierowca",
    title: `Panel Kierowcy`,
    body: `Wewnątrz: trasy do realizacji, lista dostaw na dzisiaj, mapa z punktami, status pojazdu, formularz potwierdzenia odbioru. Mobile-first — działa na telefonie.

Wymaga certyfikatu mTLS.`,
  },
  {
    selector: '[data-tour-tile="certs"]',
    area: "certificates",
    minPriority: 90,
    title: `Certyfikaty klienckie (mTLS)`,
    body: `4 zakładki w środku:
• Usługi — które domeny wymagają certu (sprzedawca/serwisant/kierowca)
• Wystaw — formularz: email + wybór paneli + ważność, generuje PKCS12 i wysyła mailem
• Lista — wystawione certy, status (active/revoked/expired), revoke
• Audit — kto kiedy wystawił/odwołał`,
  },
  {
    selector: '[data-tour-tile="directus"]',
    area: "directus",
    title: `Directus CMS`,
    body: `Headless CMS pod cms.myperformance.pl. Wewnątrz: kolekcje (mp_branding_cms, mp_email_templates_cms i własne), edytor rich-text, managment plików.

SSO przez Keycloak — auto-login.`,
  },
  {
    selector: '[data-tour-tile="documenso"]',
    area: "documenso",
    title: `Documenso — podpisy elektroniczne`,
    body: `W środku:
• Inbox — dokumenty czekające na Twój podpis
• Wysłane — które wysłałeś, status każdego signera
• Szablony — przygotowane formularze (NDA, umowy)
• Powiadomienia o podpisie trafiają do dzwonka i emaila

Auto-login przez SSO.`,
  },
  {
    selector: '[data-tour-tile="chatwoot"]',
    area: "chatwoot",
    title: `Chatwoot — live chat`,
    body: `Inbox z wszystkich kanałów:
• Web widget na stronach
• Email (forwardy do address@chat...)
• Social (Messenger, Instagram, Telegram)
• API custom

Przypisanie rozmowy do Ciebie wysyła powiadomienie do dzwonka. Auto-login przez SSO.`,
  },
  {
    selector: '[data-tour-tile="postal"]',
    area: "postal",
    minPriority: 90,
    title: `Postal — serwer pocztowy`,
    body: `Niskopoziomowe zarządzanie naszym SMTP. W środku:
• Organizations — namespace per zespół
• Servers — odrębne serwery (transactional / marketing)
• Domains — z DKIM/SPF/DMARC, statusy verified
• Credentials — klucze API/SMTP do tagowania
• Routes — gdzie wysyłać incoming mail

Dla rutynowych spraw (szablony, branding) lepiej iść w "Email i branding".`,
  },
  {
    selector: '[data-tour-tile="moodle"]',
    area: "moodle",
    title: `Akademia (Moodle)`,
    body: `Twoje LMS. W środku:
• Lista kursów (zapisanych)
• Terminy zadań i quizów
• Oceny + certyfikaty ukończenia
• Forum / wiadomości od prowadzących

Auto-login przez SSO. Onboarding course "Onboarding MyPerformance" jest auto-tworzony przy pierwszym uruchomieniu tego przewodnika.`,
  },
  {
    selector: '[data-tour-tile="knowledge"]',
    area: "knowledge",
    title: `Baza wiedzy (Outline)`,
    body: `Wewnętrzna wiki. W środku:
• Kolekcje per zespół (Engineering, Sales, Ops)
• Wyszukiwarka pełnotekstowa
• Edytor block-based (Notion-like) jeśli masz rolę Editor
• Historia zmian, komentarze

Pierwsze miejsce gdzie szukać "jak coś się robi w MyPerformance".`,
  },
  {
    selector: '[data-tour-tile="users"]',
    area: "keycloak",
    minPriority: 90,
    title: `Użytkownicy (IAM)`,
    body: `2 zakładki:
• Lista — wszystkich, filtry, zaproszenia, rest password, force logout
• Grupy — persona-bundle (Sprzedawca = sprzedawca + outline_editor + ...)

Klik w usera otwiera szczegóły: dane, role per area, sesje, integracje, audit. Usunięcie tu propaguje cascade do wszystkich apek.`,
  },
  {
    selector: '[data-tour-tile="email"]',
    area: "email-admin",
    minPriority: 90,
    title: `Email i branding`,
    body: `6 zakładek:
• Start — przeglad
• Szablony — edytor każdego maila stack-wide (login KC, password reset, brute-force alert, cert delivery, ...) z live preview i Test send
• Wygląd — globalny layout (header/footer)
• SMTP — konfiguracje (transactional/marketing aliasy)
• Branding — logo, accent, footer (propaguje do KC + Postal + apek)
• Postal — embedded niskopoziomowe`,
  },
  {
    selector: '[data-tour-tile="infrastructure"]',
    area: "infrastructure",
    minPriority: 90,
    title: `Infrastruktura serwera`,
    body: `8 zakładek:
• VPS + Backup — snapshot OVH 1-click, lista, restore
• DNS Zone — domeny i rekordy
• Zasoby — CPU/RAM/Disk + Docker stats per service
• Bezpieczeństwo / Alerty — security events feed
• Threat Intel — IP — blokady, risk score, geo, korelacja z userami
• Mapa & analityka — geo + timeline ataków
• Urządzenia — fingerprinting, sightings
• Wazuh SIEM — embed konsoli`,
  },
  {
    selector: '[data-tour-tile="keycloak"]',
    area: "keycloak",
    minPriority: 90,
    title: `Keycloak (natywna konsola)`,
    body: `Pełen dostęp do realmu MyPerformance: realmy, klienci OIDC, identity providers (Google), polityki haseł, federacja, themes. Otwiera natywną apkę KC.

Większość codziennych spraw zrobisz w naszym /admin/users — to jest dla zaawansowanej konfiguracji.`,
  },
];

/**
 * Buduje pełny tour dynamicznie z user roles. Tylko kafelki do których
 * user MA dostęp — match z DashboardClient access logic.
 */
export function buildFullSystemTour(roles: string[]): TourDefinition {
  const accessibleTiles = DASHBOARD_TILES.filter((t) => {
    if (!t.area) return true;
    return userHasAreaClient(roles, t.area, t.minPriority ?? 1);
  });

  const steps: TourStep[] = [
    {
      title: `Witaj w MyPerformance`,
      body: `Krótki przewodnik po systemie. Pokażę Ci tylko aplikacje i panele do których masz dostęp — kafelek po kafelku, z opisem co znajdziesz w środku po kliknięciu.

Sterowanie: Dalej / Wstecz / ESC żeby zakończyć w dowolnym momencie.`,
    },
    ...accessibleTiles.map<TourStep>((t) => ({
      element: t.selector,
      title: t.title,
      body: t.body,
      more: t.more,
    })),
    {
      element: '[data-tour="cmdk-button"]',
      title: `Cmd+K — szybka nawigacja`,
      body: `Naciśnij Cmd+K (lub Ctrl+K) żeby otworzyć paletę. Wpisujesz fragment nazwy ("infra", "blocks", "2fa") albo email — Enter przeskakuje. Pokazuje TYLKO opcje do których masz dostęp.`,
    },
    {
      element: '[data-tour="bell"]',
      title: `Powiadomienia`,
      body: `Tu wpadają zdarzenia z całego systemu — snapshoty, blokady IP, podpisy dokumentów, nowe role, próby logowania. Czerwony badge = nieprzeczytane. Konfiguracja per-event w Preferencjach.`,
    },
    {
      element: '[data-tour="theme-toggle"]',
      title: `Tryb jasny / ciemny`,
      body: `Klik = przełączenie. Wybór zapamiętuje się PER URZĄDZENIE (cookie + DB), więc inny tryb na laptopie i telefonie to OK.`,
    },
    {
      element: '[data-tour="account-link"]',
      title: `Twoje konto`,
      body: `Profil, hasło, 2FA (TOTP + WebAuthn), aktywne sesje, integracje (Google, Kadromierz), logi aktywności i Preferencje (powiadomienia + uruchomienie tego przewodnika ponownie).`,
    },
    {
      title: `Gotowe`,
      body: `To wszystko co warto wiedzieć na start. Kliknij dowolny kafelek żeby zacząć korzystać. Powodzenia!`,
    },
  ];

  return {
    id: "full-system",
    label: "Przewodnik",
    steps,
  };
}
