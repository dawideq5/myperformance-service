/**
 * Katalog WSZYSTKICH akcji w stacku które wysyłają (lub mogą wysyłać) emaile.
 * Każdy `actionKey` to unikalny identyfikator typu zdarzenia. Dashboard dla
 * każdej akcji trzyma szablon (mp_email_templates), który admin może edytować
 * lub wyłączyć.
 *
 * `editability` mówi co można zrobić w naszym dashboardzie:
 *   - "full"            — pełna edycja przez nasz editor (subject + body),
 *                          wysyłka idzie przez nasz gateway lub bezpośrednio
 *                          z apki która szanuje template.
 *   - "kc-localization" — edytujemy KC realm localization (subjecty + bodies),
 *                          KC FreeMarker dalej renderuje sam HTML wokół tego.
 *   - "external-link"   — edycja MUSI być w aplikacji (np. Documenso ma
 *                          wbudowany Branding/Templates UI), my pokazujemy
 *                          link "Edycja możliwa w dedykowanym interfejsie".
 *   - "readonly"        — brak możliwości edycji w ogóle (hardcoded w
 *                          kodzie aplikacji, edycja wymaga forka).
 */

export type EmailEditability =
  | "full"
  | "kc-localization"
  | "external-link"
  | "readonly";

export interface ActionVariable {
  key: string;
  label: string;
  example: string;
  description: string;
  group: string;
}

export interface CatalogAction {
  key: string;
  category: "auth" | "calendar" | "documents" | "support" | "academy" | "knowledge" | "system" | "account" | "service" | "task";
  app: string;
  appLabel: string;
  name: string;
  description: string;
  editability: EmailEditability;
  /** Komunikat dla `external-link` — opisuje gdzie edytować + URL. */
  externalEditorUrl?: string;
  externalEditorLabel?: string;
  /** Pełna lista zmiennych dostępnych w body / subject template. */
  variables: ActionVariable[];
  /** Default subject (PL). */
  defaultSubject: string;
  /** Default body (markdown / lekkie HTML). Renderowane w global layout. */
  defaultBody: string;
  /** Wskazówka dla admina — kiedy ten mail wychodzi. */
  trigger: string;
}

// ── Wspólne grupy zmiennych ─────────────────────────────────────────────────

const VARS_USER: ActionVariable[] = [
  {
    key: "user.firstName",
    label: "Imię odbiorcy",
    example: "Anna",
    description: "Imię z profilu Keycloak",
    group: "Odbiorca",
  },
  {
    key: "user.lastName",
    label: "Nazwisko odbiorcy",
    example: "Kowalska",
    description: "Nazwisko z profilu Keycloak",
    group: "Odbiorca",
  },
  {
    key: "user.fullName",
    label: "Imię i nazwisko",
    example: "Anna Kowalska",
    description: "Połączone imię i nazwisko",
    group: "Odbiorca",
  },
  {
    key: "user.email",
    label: "Email odbiorcy",
    example: "anna@example.com",
    description: "Adres email z profilu",
    group: "Odbiorca",
  },
];

const VARS_BRAND: ActionVariable[] = [
  {
    key: "brand.name",
    label: "Nazwa marki",
    example: "MyPerformance",
    description: "Z konfiguracji branding",
    group: "Marka",
  },
  {
    key: "brand.url",
    label: "URL strony",
    example: "https://myperformance.pl",
    description: "Z konfiguracji branding",
    group: "Marka",
  },
  {
    key: "brand.supportEmail",
    label: "Email pomocy",
    example: "support@myperformance.pl",
    description: "Z konfiguracji branding",
    group: "Marka",
  },
  {
    key: "brand.logoUrl",
    label: "Logo (URL)",
    example: "https://myperformance.pl/logo.png",
    description: "Wstawiane do nagłówka layoutu",
    group: "Marka",
  },
];

const VARS_TIME: ActionVariable[] = [
  {
    key: "now.date",
    label: "Aktualna data",
    example: "25 kwietnia 2026",
    description: "Data wysłania, format długi PL",
    group: "Czas",
  },
  {
    key: "now.time",
    label: "Aktualny czas",
    example: "16:42",
    description: "Godzina wysłania (HH:MM)",
    group: "Czas",
  },
];

const VARS_DEVICE: ActionVariable[] = [
  {
    key: "device.userAgent",
    label: "Przeglądarka / urządzenie",
    example: "Chrome 132 on Windows 11",
    description: "User-Agent z requesta",
    group: "Urządzenie",
  },
  {
    key: "device.ip",
    label: "Adres IP",
    example: "194.12.5.18",
    description: "IP z requesta",
    group: "Urządzenie",
  },
  {
    key: "device.location",
    label: "Lokalizacja (geo)",
    example: "Warszawa, Polska",
    description: "Geo na podstawie IP (opcjonalne)",
    group: "Urządzenie",
  },
];

// ── Katalog akcji ───────────────────────────────────────────────────────────

export const EMAIL_ACTIONS: CatalogAction[] = [
  // ── AUTH (Keycloak) ──────────────────────────────────────────────────────
  {
    key: "auth.first-login",
    category: "auth",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Pierwsze logowanie do platformy",
    description:
      "Wysyłany gdy user loguje się PIERWSZY RAZ — powitanie + skrót po platformie",
    editability: "full",
    trigger: "Pierwszy successful login po stworzeniu konta",
    defaultSubject: "Witaj w {{brand.name}}, {{user.firstName}}!",
    defaultBody: `# Cześć {{user.firstName}}!

Cieszymy się, że dołączasz do {{brand.name}}. Twoje konto jest aktywne — możesz już z niego korzystać.

## Co masz pod ręką

• **Dashboard** — wszystkie aplikacje w jednym widoku, jednym kliknięciem
• **Akademia** — kursy, szkolenia i certyfikaty zawodowe
• **Centrum dokumentów** — bezpieczne podpisywanie umów online
• **Knowledge Base** — procedury, how-to, instrukcje krok-po-kroku

## Co warto zrobić w pierwszej kolejności

• Uzupełnij swój profil (imię, nazwisko, telefon) — przyspieszy to zaproszenia od współpracowników
• Sprawdź zakładkę „Akademia" — tam znajdziesz onboarding dopasowany do Twojej roli
• Zapamiętaj adres dashboardu — wszystkie codzienne zadania zaczynają się tam

[[Otwórz Dashboard|{{brand.url}}]]`,
    variables: [...VARS_USER, ...VARS_BRAND, ...VARS_TIME],
  },
  {
    key: "auth.account-activation",
    category: "auth",
    app: "keycloak",
    appLabel: "Keycloak",
    name: "Aktywacja konta (potwierdzenie emaila)",
    description: "Link aktywacyjny — bez kliknięcia konto jest nieużywalne",
    editability: "full",
    trigger: "Po rejestracji lub admin tworzy nowego user-a",
    defaultSubject: "Aktywuj konto w {{brand.name}}",
    defaultBody: `# Witaj {{user.firstName}}

Twoje konto w {{brand.name}} zostało utworzone. Aby je aktywować i ustawić hasło, potwierdź swój adres email klikając przycisk poniżej.

[[Aktywuj konto|{{link}}]]

Link wygasa za **{{linkExpiration}} minut**. Po wygaśnięciu poproś administratora o ponowne wygenerowanie linka.

---

Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość — bez kliknięcia w link konto pozostaje nieaktywne.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "link",
        label: "Link aktywacyjny",
        example: "https://auth.myperformance.pl/realms/.../execute-actions",
        description: "One-time link aktywacyjny generowany przez KC",
        group: "Akcja",
      },
      {
        key: "linkExpiration",
        label: "Czas ważności linku (min)",
        example: "60",
        description: "Z config realm-u Keycloak",
        group: "Akcja",
      },
    ],
  },
  {
    key: "auth.password-reset",
    category: "auth",
    app: "keycloak",
    appLabel: "Keycloak",
    name: "Reset hasła",
    description: 'Wysyłany gdy user kliknie „Zapomniałem hasła"',
    editability: "full",
    trigger: "User kliknął reset hasła lub admin wymusił reset",
    defaultSubject: "Resetowanie hasła — {{brand.name}}",
    defaultBody: `# Cześć {{user.firstName}}

Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta {{brand.name}}. Kliknij poniższy przycisk, aby ustawić nowe hasło.

[[Ustaw nowe hasło|{{link}}]]

Link jest jednorazowy i wygasa za **{{linkExpiration}} minut**.

## Wskazówki dotyczące bezpieczeństwa

• Wybierz hasło o długości co najmniej 12 znaków
• Połącz duże i małe litery, cyfry oraz znaki specjalne
• Nie używaj tego samego hasła co w innych serwisach
• Nigdy nie udostępniaj go nikomu — pracownicy {{brand.name}} nigdy nie poproszą o hasło telefonicznie ani mailem

---

**Nie prosiłeś o reset?** Zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian. Jeśli zauważysz powtarzające się próby resetu, sprawdź zakładkę bezpieczeństwa w panelu konta.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "link",
        label: "Link resetu",
        example: "https://auth.myperformance.pl/...",
        description: "One-time link resetu hasła",
        group: "Akcja",
      },
      {
        key: "linkExpiration",
        label: "Czas ważności (min)",
        example: "60",
        description: "Z config realm-u",
        group: "Akcja",
      },
    ],
  },
  {
    key: "auth.email-update",
    category: "auth",
    app: "keycloak",
    appLabel: "Keycloak",
    name: "Potwierdzenie zmiany adresu email",
    description: "Idzie na NOWY adres po zmianie emaila — link potwierdza posiadanie skrzynki",
    editability: "full",
    trigger: "User zmienia email w profilu",
    defaultSubject: "Potwierdź nowy adres email — {{brand.name}}",
    defaultBody: `# Cześć {{user.firstName}}

W ustawieniach Twojego konta zmieniono adres email na **{{user.email}}**. Aby zmiana stała się skuteczna, potwierdź że jesteś właścicielem tej skrzynki.

[[Potwierdź nowy adres|{{link}}]]

Link jest jednorazowy i wygasa za **{{linkExpiration}} minut**.

---

**To nie Ty?** Zignoruj tę wiadomość — adres email nie zostanie zmieniony. Dla bezpieczeństwa zalecamy także zalogowanie się do konta i sprawdzenie listy aktywnych sesji.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "link",
        label: "Link potwierdzający",
        example: "https://auth.myperformance.pl/...",
        description: "Confirmation link",
        group: "Akcja",
      },
      {
        key: "linkExpiration",
        label: "Czas ważności (min)",
        example: "60",
        description: "Z config realm-u",
        group: "Akcja",
      },
    ],
  },
  {
    key: "auth.required-actions",
    category: "auth",
    app: "keycloak",
    appLabel: "Keycloak",
    name: "Wymuszone akcje (np. zmiana hasła)",
    description: 'Gdy admin wymusza akcję przez Admin API (np. „zmień hasło przy następnym loginie")',
    editability: "full",
    trigger: "Admin wymusi required-action",
    defaultSubject: "Wymagana akcja na koncie {{brand.name}}",
    defaultBody: `# Cześć {{user.firstName}}

Administrator zlecił wykonanie kilku czynności na Twoim koncie. Aby kontynuować korzystanie z platformy, wykonaj je teraz.

## Do zrobienia

{{requiredActions}}

Cały proces zajmuje zwykle 1–2 minuty. Kliknij poniższy przycisk, aby przejść do bezpiecznego ekranu wykonania.

[[Wykonaj akcje|{{link}}]]

Link wygasa za **{{linkExpiration}} minut**. Po wygaśnięciu zaloguj się ponownie — system zaproponuje akcje od nowa.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "link",
        label: "Link wykonania akcji",
        example: "...",
        description: "One-time link",
        group: "Akcja",
      },
      {
        key: "requiredActions",
        label: "Lista wymaganych akcji",
        example: "Zmiana hasła, weryfikacja emaila",
        description: "Sformatowana lista (lokalizowane PL)",
        group: "Akcja",
      },
      {
        key: "linkExpiration",
        label: "Czas ważności (min)",
        example: "60",
        description: "",
        group: "Akcja",
      },
    ],
  },
  {
    key: "auth.idp-link",
    category: "auth",
    app: "keycloak",
    appLabel: "Keycloak",
    name: "Powiązanie konta z dostawcą zewnętrznym",
    description: "Gdy user loguje się przez Google/Microsoft a istnieje już konto z tym emailem",
    editability: "full",
    trigger: "First login z IdP gdy KC chce połączyć z istniejącym kontem",
    defaultSubject: "Połącz konto z {{identityProviderName}} — {{brand.name}}",
    defaultBody: `# Cześć {{user.firstName}}

Próbujesz zalogować się do {{brand.name}} przez **{{identityProviderName}}**, ale na adres {{user.email}} mamy już istniejące konto. Aby uniknąć zduplikowania, łączymy te dwa logowania w jedno.

Po potwierdzeniu będziesz mógł się logować zarówno hasłem, jak i przez {{identityProviderName}} — zawsze do tego samego konta.

[[Połącz konta|{{link}}]]

---

**To nie Ty?** Zignoruj tę wiadomość — bez kliknięcia w link konta pozostają niezależne.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "link",
        label: "Link powiązujący",
        example: "...",
        description: "",
        group: "Akcja",
      },
      {
        key: "identityProviderName",
        label: "Nazwa IdP",
        example: "Google",
        description: "Z konfiguracji KC",
        group: "Akcja",
      },
    ],
  },
  {
    key: "auth.unknown-device-login",
    category: "auth",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Logowanie z nieznanego urządzenia",
    description: "Powiadomienie security gdy user loguje się z nowego device/lokacji",
    editability: "full",
    trigger: "Login z urządzenia którego user nie używał wcześniej",
    defaultSubject: "Nowe logowanie do konta {{brand.name}}",
    defaultBody: `# Cześć {{user.firstName}}

Zarejestrowaliśmy logowanie do Twojego konta z urządzenia, którego wcześniej nie używałeś.

## Szczegóły logowania

• **Data i godzina:** {{now.date}}, {{now.time}}
• **Urządzenie:** {{device.userAgent}}
• **Lokalizacja:** {{device.location}}
• **Adres IP:** {{device.ip}}

## To Ty?

Świetnie — możesz zignorować tę wiadomość. Wysyłamy ją automatycznie po każdym pierwszym logowaniu z nowego urządzenia, żeby zwiększyć Twoje bezpieczeństwo.

## To nie Ty?

Działaj natychmiast:

• **Zmień hasło** — kliknij przycisk poniżej
• Wyloguj wszystkie aktywne sesje w panelu konta → Bezpieczeństwo
• Sprawdź ostatnie operacje na koncie

[[Zabezpiecz konto|{{brand.url}}/account/security]]`,
    variables: [...VARS_USER, ...VARS_BRAND, ...VARS_TIME, ...VARS_DEVICE],
  },
  {
    key: "auth.account-disabled",
    category: "auth",
    app: "keycloak",
    appLabel: "Keycloak",
    name: "Konto wyłączone przez administratora",
    description: "Powiadomienie gdy admin wyłącza konto",
    editability: "full",
    trigger: "Admin ustawia user.enabled=false",
    defaultSubject: "Twoje konto {{brand.name}} zostało wyłączone",
    defaultBody: `# Cześć {{user.firstName}}

Informujemy, że administrator wyłączył dostęp do Twojego konta {{brand.name}}. Próby logowania zakończą się błędem do czasu ponownej aktywacji.

## Co to oznacza

• Nie zalogujesz się do panelu ani powiązanych aplikacji
• Aktywne sesje zostały wygaszone
• Twoje dane pozostają na koncie i nie zostały usunięte

## Co dalej

Skontaktuj się ze swoim przełożonym lub działem, który zarządza dostępami w organizacji. Jeśli wyłączenie jest tymczasowe (np. urlop), administrator przywróci dostęp w odpowiednim momencie.`,
    variables: [...VARS_USER, ...VARS_BRAND],
  },

  // ── CALENDAR ─────────────────────────────────────────────────────────────
  {
    key: "calendar.event-new.myperformance",
    category: "calendar",
    app: "dashboard",
    appLabel: "MyPerformance — kalendarz",
    name: "Nowe wydarzenie w kalendarzu (MyPerformance)",
    description: "Gdy ktoś tworzy wydarzenie w wewnętrznym kalendarzu dashboardu",
    editability: "full",
    trigger: "POST /api/calendar/events utworzy wydarzenie z attendee'ami",
    defaultSubject: "Zaproszenie: {{event.title}} ({{event.startDate}})",
    defaultBody: `# Zaproszenie na wydarzenie

Cześć {{user.firstName}}, {{event.organizer}} zaprasza Cię na:

## {{event.title}}

• **Data:** {{event.startDate}}, godz. {{event.startTime}}
• **Czas trwania:** {{event.duration}}
• **Miejsce:** {{event.location}}

{{event.description}}

[[Zobacz w kalendarzu|{{event.url}}]]

---

Aby dodać wydarzenie do swojego kalendarza zewnętrznego (Google, Outlook), użyj opcji „Eksportuj" po otwarciu wydarzenia. Wszelkie zmiany terminu lub miejsca będą do Ciebie automatycznie wysłane.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "event.title",
        label: "Tytuł wydarzenia",
        example: "Spotkanie zespołu",
        description: "",
        group: "Wydarzenie",
      },
      {
        key: "event.startDate",
        label: "Data",
        example: "25 kwietnia 2026",
        description: "Format długi PL",
        group: "Wydarzenie",
      },
      {
        key: "event.startTime",
        label: "Czas rozpoczęcia",
        example: "14:00",
        description: "HH:MM",
        group: "Wydarzenie",
      },
      {
        key: "event.duration",
        label: "Czas trwania",
        example: "1h 30min",
        description: "",
        group: "Wydarzenie",
      },
      {
        key: "event.location",
        label: "Miejsce",
        example: "Sala konferencyjna A",
        description: "Może być URL Google Meet",
        group: "Wydarzenie",
      },
      {
        key: "event.description",
        label: "Opis",
        example: "Standup tygodniowy",
        description: "Pełen opis wydarzenia",
        group: "Wydarzenie",
      },
      {
        key: "event.organizer",
        label: "Organizator",
        example: "Jan Nowak",
        description: "Imię i nazwisko organizatora",
        group: "Wydarzenie",
      },
      {
        key: "event.url",
        label: "Link do wydarzenia",
        example: "https://myperformance.pl/dashboard/calendar/...",
        description: "",
        group: "Wydarzenie",
      },
    ],
  },
  {
    key: "calendar.event-new.google",
    category: "calendar",
    app: "google",
    appLabel: "Google Calendar",
    name: "Nowe wydarzenie w Google Calendar",
    description: "Powiadomienia z Google Calendar — Google wysyła z własnych serwerów",
    editability: "external-link",
    externalEditorUrl: "https://calendar.google.com/calendar/u/0/r/settings/general",
    externalEditorLabel: "Ustawienia powiadomień Google Calendar",
    trigger: "Gdy ktoś z naszej organizacji tworzy event Google Calendar z naszym adresem jako attendee",
    defaultSubject: "(zarządzane przez Google)",
    defaultBody: "(treść hardcoded przez Google — edycja niemożliwa)",
    variables: [],
  },
  {
    key: "calendar.event-new.moodle",
    category: "calendar",
    app: "moodle",
    appLabel: "Moodle (Akademia)",
    name: "Nowe wydarzenie w kalendarzu Moodle",
    description: "Moodle wysyła powiadomienia o terminach kursów / deadlinów assignmentów",
    editability: "external-link",
    externalEditorUrl: "https://moodle.myperformance.pl/admin/tool/customlang/index.php",
    externalEditorLabel: "Edytor language strings Moodle",
    trigger: "Moodle cron wykryje nowy event w kalendarzu user-a",
    defaultSubject: "(zarządzane przez Moodle)",
    defaultBody: "(treść w mdl_config_plugins — edycja przez Moodle Admin)",
    variables: [],
  },
  {
    key: "calendar.event-reminder",
    category: "calendar",
    app: "dashboard",
    appLabel: "MyPerformance — kalendarz",
    name: "Przypomnienie o wydarzeniu (15 min przed)",
    description: "Cron wysyła X minut przed startem wydarzenia",
    editability: "full",
    trigger: "Cron co minutę checkuje wydarzenia w nadchodzących 15 min",
    defaultSubject: "Za {{event.minutesUntilStart}} min: {{event.title}}",
    defaultBody: `# Przypomnienie

Za **{{event.minutesUntilStart}} minut** zaczyna się:

## {{event.title}}

• **Godzina rozpoczęcia:** {{event.startTime}}
• **Miejsce:** {{event.location}}

[[Otwórz wydarzenie|{{event.url}}]]`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "event.title",
        label: "Tytuł",
        example: "Standup",
        description: "",
        group: "Wydarzenie",
      },
      {
        key: "event.startTime",
        label: "Czas startu",
        example: "14:00",
        description: "",
        group: "Wydarzenie",
      },
      {
        key: "event.minutesUntilStart",
        label: "Minut do startu",
        example: "15",
        description: "",
        group: "Wydarzenie",
      },
      {
        key: "event.location",
        label: "Miejsce",
        example: "Sala A",
        description: "",
        group: "Wydarzenie",
      },
      {
        key: "event.url",
        label: "Link",
        example: "...",
        description: "",
        group: "Wydarzenie",
      },
    ],
  },
  {
    key: "calendar.event-cancelled",
    category: "calendar",
    app: "dashboard",
    appLabel: "MyPerformance — kalendarz",
    name: "Anulowanie wydarzenia",
    description: "Gdy organizator anuluje event",
    editability: "full",
    trigger: "DELETE wydarzenia z attendee'ami",
    defaultSubject: "Anulowano: {{event.title}}",
    defaultBody: `# Wydarzenie odwołane

Cześć {{user.firstName}}, organizator anulował wydarzenie:

## {{event.title}}

• **Pierwotny termin:** {{event.startDate}}, godz. {{event.startTime}}

**Powód anulowania:** {{event.cancellationReason}}

Wydarzenie zostało automatycznie usunięte z Twojego kalendarza. Jeśli zostanie zaplanowane ponownie, otrzymasz nowe zaproszenie.`,
    variables: [
      ...VARS_USER,
      {
        key: "event.title",
        label: "Tytuł",
        example: "Spotkanie",
        description: "",
        group: "Wydarzenie",
      },
      {
        key: "event.startDate",
        label: "Data",
        example: "25 kwietnia",
        description: "",
        group: "Wydarzenie",
      },
      {
        key: "event.startTime",
        label: "Czas",
        example: "14:00",
        description: "",
        group: "Wydarzenie",
      },
      {
        key: "event.cancellationReason",
        label: "Powód anulowania",
        example: "Choroba prelegenta",
        description: "Opcjonalny",
        group: "Wydarzenie",
      },
    ],
  },

  // ── DOCUMENTS (Documenso) ────────────────────────────────────────────────
  {
    key: "documents.signing-request",
    category: "documents",
    app: "documenso",
    appLabel: "Documenso (Centrum dokumentów)",
    name: "Prośba o podpisanie dokumentu",
    description: "Documenso wysyła do każdego signera",
    editability: "external-link",
    externalEditorUrl: "https://sign.myperformance.pl/settings/branding",
    externalEditorLabel: "Documenso Branding & Templates",
    trigger: "Wysłanie dokumentu do podpisu",
    defaultSubject: "(zarządzane przez Documenso)",
    defaultBody: "(treść w React Email TSX w source code Documenso)",
    variables: [],
  },
  {
    key: "documents.signed",
    category: "documents",
    app: "documenso",
    appLabel: "Documenso",
    name: "Dokument podpisany — kopia dla wszystkich",
    description: "Po podpisaniu przez wszystkich, każdy dostaje finalny PDF",
    editability: "external-link",
    externalEditorUrl: "https://sign.myperformance.pl/settings/branding",
    externalEditorLabel: "Documenso Branding & Templates",
    trigger: "Ostatni signer podpisał",
    defaultSubject: "(zarządzane przez Documenso)",
    defaultBody: "",
    variables: [],
  },
  {
    key: "documents.signing-reminder",
    category: "documents",
    app: "documenso",
    appLabel: "Documenso",
    name: "Przypomnienie o niepodpisanym dokumencie",
    description: "Cron Documenso po N dniach",
    editability: "external-link",
    externalEditorUrl: "https://sign.myperformance.pl/settings/branding",
    externalEditorLabel: "Documenso Branding & Templates",
    trigger: "Cron sprawdza pending sygnatury",
    defaultSubject: "(zarządzane przez Documenso)",
    defaultBody: "",
    variables: [],
  },

  // ── SUPPORT (Chatwoot) ───────────────────────────────────────────────────
  {
    key: "support.agent-assigned",
    category: "support",
    app: "chatwoot",
    appLabel: "Chatwoot (obsługa klienta)",
    name: "Konwersacja przypisana do agenta",
    description: "Powiadomienie wewnętrzne dla agenta",
    editability: "external-link",
    externalEditorUrl: "https://chatwoot.myperformance.pl/super_admin",
    externalEditorLabel: "Chatwoot Super Admin → Email branding",
    trigger: "Konwersacja zmienia assignee",
    defaultSubject: "(zarządzane przez Chatwoot)",
    defaultBody: "",
    variables: [],
  },
  {
    key: "support.new-message",
    category: "support",
    app: "chatwoot",
    appLabel: "Chatwoot",
    name: "Nowa wiadomość w konwersacji",
    description: "Gdy klient odpowiada w trwającej konwersacji",
    editability: "external-link",
    externalEditorUrl: "https://chatwoot.myperformance.pl/super_admin",
    externalEditorLabel: "Chatwoot Super Admin",
    trigger: "Wiadomość od klienta",
    defaultSubject: "(zarządzane przez Chatwoot)",
    defaultBody: "",
    variables: [],
  },

  // ── ACADEMY (Moodle) ─────────────────────────────────────────────────────
  {
    key: "academy.course-enrollment",
    category: "academy",
    app: "moodle",
    appLabel: "Moodle (Akademia)",
    name: "Zapisanie na kurs",
    description: "User został zapisany na kurs Moodle",
    editability: "external-link",
    externalEditorUrl: "https://moodle.myperformance.pl/admin/tool/customlang/index.php",
    externalEditorLabel: "Moodle Admin → Languages → Customise PL",
    trigger: "Enrollment do kursu",
    defaultSubject: "(zarządzane przez Moodle)",
    defaultBody: "",
    variables: [],
  },
  {
    key: "academy.assignment-due",
    category: "academy",
    app: "moodle",
    appLabel: "Moodle",
    name: "Zbliżający się termin assignmentu",
    description: "Cron Moodle wysyła X dni przed deadlinem",
    editability: "external-link",
    externalEditorUrl: "https://moodle.myperformance.pl/admin/tool/customlang/index.php",
    externalEditorLabel: "Moodle Admin → Languages",
    trigger: "Cron",
    defaultSubject: "(zarządzane przez Moodle)",
    defaultBody: "",
    variables: [],
  },
  {
    key: "academy.grade-posted",
    category: "academy",
    app: "moodle",
    appLabel: "Moodle",
    name: "Wystawienie oceny",
    description: "Nauczyciel wystawił ocenę za assignment",
    editability: "external-link",
    externalEditorUrl: "https://moodle.myperformance.pl/admin/tool/customlang/index.php",
    externalEditorLabel: "Moodle Admin → Languages",
    trigger: "Grading w Moodle",
    defaultSubject: "(zarządzane przez Moodle)",
    defaultBody: "",
    variables: [],
  },

  // ── KNOWLEDGE (Outline) ──────────────────────────────────────────────────
  {
    key: "knowledge.invitation",
    category: "knowledge",
    app: "outline",
    appLabel: "Outline (Knowledge Base)",
    name: "Zaproszenie do workspace",
    description: "Admin Outline zaprasza nowego user-a",
    editability: "readonly",
    trigger: "Outline UI → Settings → Members → Invite",
    defaultSubject: "(hardcoded w source Outline)",
    defaultBody: "",
    variables: [],
  },
  {
    key: "knowledge.mention",
    category: "knowledge",
    app: "outline",
    appLabel: "Outline",
    name: "Wzmianka w dokumencie (@user)",
    description: "Ktoś otaguje user-a w dokumencie",
    editability: "readonly",
    trigger: "@mention w edycji dokumentu",
    defaultSubject: "(hardcoded w source Outline)",
    defaultBody: "",
    variables: [],
  },

  // ── SYSTEM (Dashboard) ───────────────────────────────────────────────────
  {
    key: "system.cert-delivery",
    category: "system",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Wystawiony certyfikat klienta (PKCS12)",
    description: "Po wystawieniu w /admin/certificates — plik .p12 z hasłem",
    editability: "full",
    trigger: "Admin wystawia cert",
    defaultSubject: "Twój certyfikat dostępu — {{brand.name}}",
    defaultBody: `# Cześć {{user.fullName}}

W załączniku znajdziesz plik certyfikatu klienta wymagany do logowania w panelach: **{{cert.roles}}**.

## Dane certyfikatu

• **Plik:** zaszyfrowany .p12 w załączniku tej wiadomości
• **Hasło do pliku:** \`{{cert.password}}\`
• **Ważny do:** {{cert.validUntil}}
• **Numer seryjny:** \`{{cert.serial}}\`

> Hasło widoczne jest tylko teraz — zapisz je w bezpiecznym menedżerze haseł, ponieważ nie będzie można go odzyskać.

## Instalacja na Windows 10/11

• Pobierz załącznik na komputer
• Kliknij dwukrotnie plik — uruchomi się **Kreator importu certyfikatów**
• Wybierz lokalizację magazynu: **Bieżący użytkownik**
• Wpisz hasło z punktu wyżej
• Wybierz: **Wybierz magazyn certyfikatów ręcznie → Osobiste**
• Po imporcie odśwież przeglądarkę i wejdź na panel

## Instalacja na macOS

• Pobierz załącznik
• Kliknij dwukrotnie — otworzy się **Pęk kluczy**
• Wybierz pęk **logowanie**, wpisz hasło z punktu wyżej
• Po imporcie restartuj przeglądarkę

## Jak działa logowanie

Po zainstalowaniu certyfikatu wejście na panel automatycznie poprosi o jego wybór. Wybierz nowo zainstalowany cert i kontynuuj logowanie standardowym hasłem do {{brand.name}}.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "cert.password",
        label: "Hasło do .p12",
        example: "Kj9fQ-mn4Xp",
        description: "Generowane jednorazowo, nie da się odzyskać",
        group: "Certyfikat",
      },
      {
        key: "cert.validUntil",
        label: "Data wygaśnięcia",
        example: "25 kwietnia 2027",
        description: "Format długi PL",
        group: "Certyfikat",
      },
      {
        key: "cert.serial",
        label: "Numer seryjny",
        example: "ab:c1:23:...",
        description: "Identyfikator certu",
        group: "Certyfikat",
      },
      {
        key: "cert.roles",
        label: "Lista paneli",
        example: "Sprzedawca, Serwisant",
        description: "Sformatowana lista paneli dostępnych z tym certem",
        group: "Certyfikat",
      },
    ],
  },
  {
    key: "system.account-deprovisioned",
    category: "system",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Powiadomienie o usunięciu konta",
    description: "Wysyłany TUŻ PRZED usunięciem konta gdy admin inicjuje cascade delete",
    editability: "full",
    trigger: "Admin DELETE w /admin/users",
    defaultSubject: "Twoje konto {{brand.name}} zostało usunięte",
    defaultBody: `# Cześć {{user.fullName}}

Informujemy, że Twoje konto w {{brand.name}} zostało zamknięte przez administratora w dniu {{now.date}}.

## Co to oznacza

• Dostęp do wszystkich aplikacji platformy został odebrany
• Wszystkie aktywne sesje zostały zakończone
• Dane Twojego konta są w trakcie usuwania zgodnie z polityką prywatności
• Zachowane pozostają jedynie te informacje, które wymaga prawo (faktury, dokumenty podpisane elektronicznie itp.)

## Co dalej

Jeśli uważasz, że to pomyłka, skontaktuj się ze swoim przełożonym lub działem administrującym dostępami w organizacji. Po zamknięciu konta nie możesz się już zalogować — także w celu pobrania własnych dokumentów. Jeśli potrzebujesz dostępu do swoich danych, poproś administratora o wyeksportowanie ich przed ostatecznym usunięciem.

Dziękujemy za czas spędzony w {{brand.name}}.`,
    variables: [...VARS_USER, ...VARS_BRAND, ...VARS_TIME],
  },
  // ── ACCOUNT (Dashboard — powiadomienia bezpieczeństwa) ──────────────────
  {
    key: "account.welcome",
    category: "account",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Witamy w MyPerformance",
    description: "Wysyłany po pierwszym logowaniu — powitanie i skrót po platformie",
    editability: "full",
    trigger: "Pierwszy successful login po stworzeniu konta",
    defaultSubject: "Witaj w {{brand.name}}, {{user.firstName}}!",
    defaultBody: `# Cześć {{user.firstName}}!

Cieszymy się, że dołączasz do {{brand.name}}. Twoje konto jest aktywne — możesz już z niego korzystać.

## Co masz pod ręką

• **Dashboard** — wszystkie aplikacje w jednym widoku, jednym kliknięciem
• **Akademia** — kursy, szkolenia i certyfikaty zawodowe
• **Centrum dokumentów** — bezpieczne podpisywanie umów online
• **Knowledge Base** — procedury, how-to, instrukcje krok-po-kroku

[[Otwórz Dashboard|{{brand.url}}]]`,
    variables: [...VARS_USER, ...VARS_BRAND, ...VARS_TIME],
  },
  {
    key: "account.password-changed",
    category: "account",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Hasło zostało zmienione",
    description: "Powiadomienie security po zmianie hasła przez usera lub admina",
    editability: "full",
    trigger: "Zmiana hasła w Keycloak (wymuszona lub dobrowolna)",
    defaultSubject: "Hasło do konta {{brand.name}} zostało zmienione",
    defaultBody: `# Cześć {{user.firstName}}

Informujemy, że hasło do Twojego konta {{brand.name}} zostało właśnie zmienione.

## Szczegóły

• **Data i godzina:** {{now.date}}, {{now.time}}

## To nie Ty?

Jeśli nie zmieniałeś hasła, Twoje konto mogło zostać przejęte. Działaj natychmiast:

• Skontaktuj się z administratorem — wyślij email na {{brand.supportEmail}}
• Poproś o tymczasowe zablokowanie konta do wyjaśnienia sytuacji

[[Przejdź do panelu konta|{{brand.url}}/account/security]]`,
    variables: [...VARS_USER, ...VARS_BRAND, ...VARS_TIME],
  },
  {
    key: "account.2fa-enabled",
    category: "account",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Weryfikacja dwuskładnikowa włączona",
    description: "Potwierdzenie aktywacji 2FA na koncie",
    editability: "full",
    trigger: "User aktywuje 2FA w ustawieniach konta",
    defaultSubject: "Weryfikacja dwuskładnikowa włączona — {{brand.name}}",
    defaultBody: `# Cześć {{user.firstName}}

Weryfikacja dwuskładnikowa (2FA) została włączona na Twoim koncie {{brand.name}}.

## Co to oznacza

• Przy każdym logowaniu system poprosi Cię o dodatkowy kod
• Nawet jeśli ktoś pozna Twoje hasło, nie będzie mógł się zalogować bez Twojego urządzenia
• Jeśli zgubisz dostęp do urządzenia 2FA, skontaktuj się z administratorem

**Data aktywacji:** {{now.date}}, {{now.time}}

Jeśli to nie Ty włączyłeś 2FA — natychmiast skontaktuj się z {{brand.supportEmail}}.`,
    variables: [...VARS_USER, ...VARS_BRAND, ...VARS_TIME],
  },
  {
    key: "account.session-new-device",
    category: "account",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Nowe urządzenie zalogowane",
    description: "Powiadomienie security gdy user loguje się z nowego device lub lokalizacji",
    editability: "full",
    trigger: "Login z urządzenia którego user nie używał wcześniej",
    defaultSubject: "Nowe logowanie do konta {{brand.name}}",
    defaultBody: `# Cześć {{user.firstName}}

Zarejestrowaliśmy logowanie do Twojego konta z nowego urządzenia.

## Szczegóły logowania

• **Data i godzina:** {{now.date}}, {{now.time}}
• **Urządzenie:** {{device.userAgent}}
• **Lokalizacja:** {{device.location}}
• **Adres IP:** {{device.ip}}

## To Ty?

Możesz zignorować tę wiadomość. Wysyłamy ją automatycznie po każdym pierwszym logowaniu z nowego urządzenia.

## To nie Ty?

• Natychmiast zmień hasło w panelu konta
• Wyloguj wszystkie aktywne sesje → Bezpieczeństwo

[[Zabezpiecz konto|{{brand.url}}/account/security]]`,
    variables: [...VARS_USER, ...VARS_BRAND, ...VARS_TIME, ...VARS_DEVICE],
  },
  {
    key: "account.cert-issued",
    category: "account",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Wystawiono certyfikat kliencki",
    description: "Powiadomienie gdy admin wystawia lub odnawia certyfikat mTLS dla usera",
    editability: "full",
    trigger: "Admin wystawia cert przez /admin/certificates",
    defaultSubject: "Twój certyfikat dostępu — {{brand.name}}",
    defaultBody: `# Cześć {{user.fullName}}

Wystawiono dla Ciebie nowy certyfikat klienta wymagany do dostępu do chronionych paneli.

## Dane certyfikatu

• **Plik:** zaszyfrowany .p12 w załączniku
• **Hasło do pliku:** \`{{cert.password}}\`
• **Ważny do:** {{cert.validUntil}}
• **Numer seryjny:** \`{{cert.serial}}\`
• **Dostęp do:** {{cert.roles}}

> Zapisz hasło w menedżerze haseł — nie można go odzyskać.

## Instalacja (Windows)

Kliknij dwukrotnie plik .p12 → Kreator importu → Bieżący użytkownik → Osobiste → wpisz hasło.

## Instalacja (macOS)

Kliknij dwukrotnie plik .p12 → Pęk kluczy → wpisz hasło.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "cert.password",
        label: "Hasło do .p12",
        example: "Kj9fQ-mn4Xp",
        description: "Generowane jednorazowo",
        group: "Certyfikat",
      },
      {
        key: "cert.validUntil",
        label: "Data wygaśnięcia",
        example: "25 kwietnia 2027",
        description: "Format długi PL",
        group: "Certyfikat",
      },
      {
        key: "cert.serial",
        label: "Numer seryjny",
        example: "ab:c1:23:...",
        description: "",
        group: "Certyfikat",
      },
      {
        key: "cert.roles",
        label: "Lista paneli",
        example: "Sprzedawca, Serwisant",
        description: "",
        group: "Certyfikat",
      },
    ],
  },
  {
    key: "account.cert-expiring",
    category: "account",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Certyfikat wygaśnie za 30 dni",
    description: "Cron wysyła ostrzeżenie 30 dni przed wygaśnięciem certyfikatu mTLS",
    editability: "full",
    trigger: "Cron sprawdza certyfikaty wygasające w ciągu 30 dni",
    defaultSubject: "Twój certyfikat {{brand.name}} wygaśnie {{cert.expiryDate}}",
    defaultBody: `# Cześć {{user.fullName}}

Twój certyfikat klienta {{brand.name}} wygaśnie **{{cert.expiryDate}}** (za {{cert.daysLeft}} dni).

## Co się stanie po wygaśnięciu

Po upłynięciu terminu ważności nie będziesz mógł zalogować się do chronionych paneli wymagających certyfikatu.

## Co zrobić

Skontaktuj się z administratorem systemowym w celu odnowienia certyfikatu. Nowy certyfikat zostanie wysłany na ten adres email z nowym plikiem .p12.

• **Numer seryjny:** \`{{cert.serial}}\`
• **Dotyczy paneli:** {{cert.roles}}`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "cert.expiryDate",
        label: "Data wygaśnięcia",
        example: "31 maja 2026",
        description: "Format długi PL",
        group: "Certyfikat",
      },
      {
        key: "cert.daysLeft",
        label: "Dni do wygaśnięcia",
        example: "30",
        description: "",
        group: "Certyfikat",
      },
      {
        key: "cert.serial",
        label: "Numer seryjny",
        example: "ab:c1:23:...",
        description: "",
        group: "Certyfikat",
      },
      {
        key: "cert.roles",
        label: "Lista paneli",
        example: "Sprzedawca, Serwisant",
        description: "",
        group: "Certyfikat",
      },
    ],
  },

  // ── SERVICE (Serwis telefonów — zlecenieserwisowe.pl) ────────────────────
  {
    key: "service.created",
    category: "service",
    app: "dashboard",
    appLabel: "Serwis Telefonów (zlecenieserwisowe.pl)",
    name: "Przyjęto urządzenie do serwisu",
    description: "Wysyłany do klienta po przyjęciu urządzenia i otworzeniu zlecenia serwisowego",
    editability: "full",
    trigger: "Otwarcie nowego zlecenia serwisowego",
    defaultSubject: "Przyjęliśmy Twoje urządzenie do serwisu — zlecenie {{ticket.number}}",
    defaultBody: `# Dzień dobry {{user.firstName}},

Twoje urządzenie zostało przyjęte do naszego serwisu. Poniżej znajdziesz szczegóły zlecenia.

## Szczegóły zlecenia

• **Numer zlecenia:** {{ticket.number}}
• **Urządzenie:** {{ticket.deviceName}}
• **Opis usterki:** {{ticket.faultDescription}}
• **Data przyjęcia:** {{now.date}}

## Co dalej

Nasi technicy przystąpią do diagnostyki urządzenia. O każdej zmianie statusu poinformujemy Cię mailowo. Możesz też śledzić status online:

[[Śledź zlecenie|{{brand.url}}/zlecenie/{{ticket.number}}]]

W razie pytań zadzwoń do nas: {{brand.supportEmail}}`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      ...VARS_TIME,
      {
        key: "ticket.number",
        label: "Numer zlecenia",
        example: "ZS-2026-0042",
        description: "Unikalny numer zlecenia serwisowego",
        group: "Zlecenie",
      },
      {
        key: "ticket.deviceName",
        label: "Nazwa urządzenia",
        example: "Samsung Galaxy S23",
        description: "Marka i model urządzenia",
        group: "Zlecenie",
      },
      {
        key: "ticket.faultDescription",
        label: "Opis usterki",
        example: "Pęknięty wyświetlacz",
        description: "Usterka podana przy przyjęciu",
        group: "Zlecenie",
      },
    ],
  },
  {
    key: "service.status-changed",
    category: "service",
    app: "dashboard",
    appLabel: "Serwis Telefonów (zlecenieserwisowe.pl)",
    name: "Status zlecenia zmieniony",
    description: "Powiadomienie gdy technik zmienia status zlecenia (diagnoza, naprawa, oczekuje na część itp.)",
    editability: "full",
    trigger: "Zmiana statusu zlecenia przez technika",
    defaultSubject: "Aktualizacja zlecenia {{ticket.number}} — {{ticket.newStatus}}",
    defaultBody: `# Aktualizacja zlecenia

Dzień dobry {{user.firstName}},

Status Twojego zlecenia serwisowego **{{ticket.number}}** uległ zmianie.

## Nowy status: {{ticket.newStatus}}

{{ticket.statusNote}}

• **Urządzenie:** {{ticket.deviceName}}
• **Data aktualizacji:** {{now.date}}, {{now.time}}

[[Sprawdź pełny status|{{brand.url}}/zlecenie/{{ticket.number}}]]`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      ...VARS_TIME,
      {
        key: "ticket.number",
        label: "Numer zlecenia",
        example: "ZS-2026-0042",
        description: "",
        group: "Zlecenie",
      },
      {
        key: "ticket.deviceName",
        label: "Nazwa urządzenia",
        example: "Samsung Galaxy S23",
        description: "",
        group: "Zlecenie",
      },
      {
        key: "ticket.newStatus",
        label: "Nowy status",
        example: "Oczekuje na część",
        description: "Czytelna nazwa statusu",
        group: "Zlecenie",
      },
      {
        key: "ticket.statusNote",
        label: "Notatka technika",
        example: "Zamówiliśmy wyświetlacz — dostawa 2–3 dni robocze.",
        description: "Opcjonalna notatka technika przy zmianie statusu",
        group: "Zlecenie",
      },
    ],
  },
  {
    key: "service.completed",
    category: "service",
    app: "dashboard",
    appLabel: "Serwis Telefonów (zlecenieserwisowe.pl)",
    name: "Urządzenie gotowe do odbioru",
    description: "Powiadomienie gdy naprawa zakończona i urządzenie czeka na odbiór",
    editability: "full",
    trigger: "Technik zamyka zlecenie ze statusem 'gotowe do odbioru'",
    defaultSubject: "Urządzenie gotowe do odbioru — zlecenie {{ticket.number}}",
    defaultBody: `# Urządzenie gotowe!

Dzień dobry {{user.firstName}},

Twoje urządzenie po naprawie jest gotowe do odbioru.

## Szczegóły

• **Numer zlecenia:** {{ticket.number}}
• **Urządzenie:** {{ticket.deviceName}}
• **Wykonana usługa:** {{ticket.serviceDescription}}
• **Koszt naprawy:** {{ticket.totalCost}}

## Odbiór

Zapraszamy do naszego punktu serwisowego. Prosimy zabrać ze sobą dokument potwierdzający tożsamość.

**Adres:** UNIKOM S.C., ul. Towarowa 2c, 43-100 Tychy

[[Potwierdź odbiór online|{{brand.url}}/zlecenie/{{ticket.number}}]]`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "ticket.number",
        label: "Numer zlecenia",
        example: "ZS-2026-0042",
        description: "",
        group: "Zlecenie",
      },
      {
        key: "ticket.deviceName",
        label: "Nazwa urządzenia",
        example: "Samsung Galaxy S23",
        description: "",
        group: "Zlecenie",
      },
      {
        key: "ticket.serviceDescription",
        label: "Opis wykonanej usługi",
        example: "Wymiana wyświetlacza",
        description: "",
        group: "Zlecenie",
      },
      {
        key: "ticket.totalCost",
        label: "Koszt naprawy",
        example: "350,00 zł",
        description: "Sformatowana kwota z walutą",
        group: "Zlecenie",
      },
    ],
  },
  {
    key: "service.document-signed",
    category: "service",
    app: "documenso",
    appLabel: "Documenso + Serwis Telefonów",
    name: "Dokument podpisany elektronicznie przez klienta",
    description: "Powiadomienie do technika/admina gdy klient podpisze dokument serwisowy",
    editability: "full",
    trigger: "Webhook Documenso DOCUMENT_COMPLETED dla dokumentu powiązanego z zleceniem",
    defaultSubject: "Klient podpisał dokument — zlecenie {{ticket.number}}",
    defaultBody: `# Dokument podpisany

Klient **{{user.fullName}}** podpisał dokument dla zlecenia **{{ticket.number}}**.

## Szczegóły

• **Urządzenie:** {{ticket.deviceName}}
• **Data podpisu:** {{now.date}}, {{now.time}}
• **Dokument:** {{document.title}}

Kopia dokumentu została automatycznie wysłana do klienta.

[[Otwórz zlecenie|{{brand.url}}/admin/serwis/{{ticket.number}}]]`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      ...VARS_TIME,
      {
        key: "ticket.number",
        label: "Numer zlecenia",
        example: "ZS-2026-0042",
        description: "",
        group: "Zlecenie",
      },
      {
        key: "ticket.deviceName",
        label: "Nazwa urządzenia",
        example: "Samsung Galaxy S23",
        description: "",
        group: "Zlecenie",
      },
      {
        key: "document.title",
        label: "Tytuł dokumentu",
        example: "Potwierdzenie odbioru urządzenia ZS-2026-0042",
        description: "",
        group: "Dokument",
      },
    ],
  },
  {
    key: "service.receipt-sent",
    category: "service",
    app: "dashboard",
    appLabel: "Serwis Telefonów (zlecenieserwisowe.pl)",
    name: "Potwierdzenie odbioru wysłane",
    description: "Kopia podpisanego potwierdzenia odbioru wysyłana do klienta po DOCUMENT_COMPLETED",
    editability: "full",
    trigger: "Webhook Documenso DOCUMENT_COMPLETED — podpisane potwierdzenie odbioru",
    defaultSubject: "Kopia podpisanego potwierdzenia {{ticket.number}}",
    defaultBody: `# Potwierdzenie odbioru

{{user.firstName ? 'Witaj ' + user.firstName + ',' : 'Dzień dobry,'}}

W załączniku znajdziesz podpisaną kopię potwierdzenia odbioru urządzenia **{{ticket.number}}**. Dokument zawiera podpisy obu stron i pełen audyt z usługi Documenso.

Status zlecenia możesz śledzić na [{{brand.url}}]({{brand.url}}){{ticket.servicePhone ? ' lub skontaktować się pod numerem ' + ticket.servicePhone : ''}}.

---

{{brand.name}} · UNIKOM S.C., ul. Towarowa 2c, 43-100 Tychy`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "ticket.number",
        label: "Numer zlecenia",
        example: "ZS-2026-0042",
        description: "",
        group: "Zlecenie",
      },
      {
        key: "ticket.servicePhone",
        label: "Telefon punktu serwisowego",
        example: "+48 32 123 45 67",
        description: "Opcjonalny — null = sekcja telefonu pominięta",
        group: "Zlecenie",
      },
    ],
  },

  // ── ACADEMY — własne akcje Dashboard (nie Moodle) ────────────────────────
  {
    key: "academy.course-assigned",
    category: "academy",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Przypisano Cię do kursu",
    description: "Powiadomienie wysyłane przez dashboard gdy admin ręcznie przypisuje usera do kursu Moodle",
    editability: "full",
    trigger: "Admin przypisuje kurs przez panel dashboardu",
    defaultSubject: "Przypisano Cię do kursu: {{course.name}}",
    defaultBody: `# Nowy kurs do realizacji

Cześć {{user.firstName}},

Administrator przypisał Cię do nowego kursu w Akademii {{brand.name}}.

## Kurs

• **Nazwa:** {{course.name}}
• **Opis:** {{course.description}}
• **Termin zakończenia:** {{course.dueDate}}
• **Szacowany czas:** {{course.estimatedTime}}

Zaloguj się do Akademii, aby rozpocząć naukę.

[[Przejdź do kursu|{{course.url}}]]`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "course.name",
        label: "Nazwa kursu",
        example: "Obsługa systemu CRM",
        description: "",
        group: "Kurs",
      },
      {
        key: "course.description",
        label: "Opis kursu",
        example: "Kurs wprowadzający do pracy z systemem CRM.",
        description: "",
        group: "Kurs",
      },
      {
        key: "course.dueDate",
        label: "Termin zakończenia",
        example: "31 maja 2026",
        description: "Format długi PL, opcjonalny",
        group: "Kurs",
      },
      {
        key: "course.estimatedTime",
        label: "Szacowany czas",
        example: "2 godziny",
        description: "Opcjonalny",
        group: "Kurs",
      },
      {
        key: "course.url",
        label: "Link do kursu",
        example: "https://moodle.myperformance.pl/course/view.php?id=42",
        description: "",
        group: "Kurs",
      },
    ],
  },
  {
    key: "academy.grade-received",
    category: "academy",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Otrzymałeś ocenę",
    description: "Powiadomienie przez dashboard gdy Moodle webhook zgłosi wystawienie oceny",
    editability: "full",
    trigger: "Webhook Moodle lub cron po wystawieniu oceny przez nauczyciela",
    defaultSubject: "Nowa ocena w {{course.name}} — {{brand.name}}",
    defaultBody: `# Otrzymałeś ocenę!

Cześć {{user.firstName}},

Twój nauczyciel wystawił ocenę za zadanie w kursie **{{course.name}}**.

## Szczegóły

• **Kurs:** {{course.name}}
• **Zadanie:** {{assignment.name}}
• **Ocena:** {{grade.value}} / {{grade.maxValue}}
• **Komentarz:** {{grade.feedback}}

[[Sprawdź szczegóły|{{course.url}}]]`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "course.name",
        label: "Nazwa kursu",
        example: "Obsługa systemu CRM",
        description: "",
        group: "Kurs",
      },
      {
        key: "course.url",
        label: "Link do kursu",
        example: "https://moodle.myperformance.pl/course/view.php?id=42",
        description: "",
        group: "Kurs",
      },
      {
        key: "assignment.name",
        label: "Nazwa zadania",
        example: "Quiz końcowy moduł 1",
        description: "",
        group: "Kurs",
      },
      {
        key: "grade.value",
        label: "Ocena",
        example: "85",
        description: "Liczba punktów lub ocena",
        group: "Kurs",
      },
      {
        key: "grade.maxValue",
        label: "Maksymalna ocena",
        example: "100",
        description: "",
        group: "Kurs",
      },
      {
        key: "grade.feedback",
        label: "Komentarz nauczyciela",
        example: "Dobra robota! Zwróć uwagę na moduł 3.",
        description: "Opcjonalny",
        group: "Kurs",
      },
    ],
  },

  // ── TASK (Zadania / projekty) ─────────────────────────────────────────────
  {
    key: "task.assigned",
    category: "task",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Przypisano Ci zadanie",
    description: "Powiadomienie gdy ktoś przypisuje zadanie do usera w module zadań",
    editability: "full",
    trigger: "Przypisanie zadania do usera przez innego usera lub admina",
    defaultSubject: "Nowe zadanie: {{task.title}}",
    defaultBody: `# Nowe zadanie dla Ciebie

Cześć {{user.firstName}},

**{{task.assignedBy}}** przypisał Ci nowe zadanie.

## Szczegóły zadania

• **Tytuł:** {{task.title}}
• **Opis:** {{task.description}}
• **Termin:** {{task.dueDate}}
• **Priorytet:** {{task.priority}}
• **Projekt:** {{task.projectName}}

[[Otwórz zadanie|{{task.url}}]]`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "task.title",
        label: "Tytuł zadania",
        example: "Przygotowanie oferty dla klienta XYZ",
        description: "",
        group: "Zadanie",
      },
      {
        key: "task.description",
        label: "Opis zadania",
        example: "Przygotuj ofertę na serwis 50 telefonów.",
        description: "Opcjonalny",
        group: "Zadanie",
      },
      {
        key: "task.dueDate",
        label: "Termin",
        example: "15 maja 2026",
        description: "Format długi PL",
        group: "Zadanie",
      },
      {
        key: "task.priority",
        label: "Priorytet",
        example: "Wysoki",
        description: "Niski / Średni / Wysoki / Krytyczny",
        group: "Zadanie",
      },
      {
        key: "task.projectName",
        label: "Nazwa projektu",
        example: "Q2 2026 — serwis korporacyjny",
        description: "Opcjonalny",
        group: "Zadanie",
      },
      {
        key: "task.assignedBy",
        label: "Przypisujący",
        example: "Jan Kowalski",
        description: "Imię i nazwisko osoby przypisującej",
        group: "Zadanie",
      },
      {
        key: "task.url",
        label: "Link do zadania",
        example: "https://myperformance.pl/dashboard/tasks/123",
        description: "",
        group: "Zadanie",
      },
    ],
  },
  {
    key: "task.due-soon",
    category: "task",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Zadanie do wykonania wkrótce",
    description: "Cron wysyła przypomnienie gdy termin zadania zbliża się (domyślnie 24h przed)",
    editability: "full",
    trigger: "Cron — zadania z terminem w ciągu 24h, nieukończone",
    defaultSubject: "Przypomnienie: {{task.title}} — termin {{task.dueDate}}",
    defaultBody: `# Przypomnienie o zadaniu

Cześć {{user.firstName}},

Zbliża się termin wykonania zadania przypisanego do Ciebie.

## Zadanie

• **Tytuł:** {{task.title}}
• **Termin:** {{task.dueDate}}
• **Priorytet:** {{task.priority}}
• **Projekt:** {{task.projectName}}

[[Otwórz zadanie|{{task.url}}]]

Jeśli zadanie zostało już ukończone, oznacz je jako zakończone w panelu.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "task.title",
        label: "Tytuł zadania",
        example: "Przygotowanie oferty",
        description: "",
        group: "Zadanie",
      },
      {
        key: "task.dueDate",
        label: "Termin",
        example: "15 maja 2026, 17:00",
        description: "",
        group: "Zadanie",
      },
      {
        key: "task.priority",
        label: "Priorytet",
        example: "Wysoki",
        description: "",
        group: "Zadanie",
      },
      {
        key: "task.projectName",
        label: "Nazwa projektu",
        example: "Q2 2026",
        description: "Opcjonalny",
        group: "Zadanie",
      },
      {
        key: "task.url",
        label: "Link do zadania",
        example: "https://myperformance.pl/dashboard/tasks/123",
        description: "",
        group: "Zadanie",
      },
    ],
  },

  // ── SYSTEM (dodatkowe alerty admina) ─────────────────────────────────────
  {
    key: "system.backup-failed",
    category: "system",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Backup systemu nieudany",
    description: "Alert do administratora gdy zaplanowany backup zakończy się błędem",
    editability: "full",
    trigger: "Cron backupu kończy się błędem — wysyłane tylko do adminów",
    defaultSubject: "[ALERT] Backup systemu nieudany — {{now.date}}",
    defaultBody: `# [ALERT] Backup nieudany

Automatyczny backup systemu zakończył się błędem.

## Szczegóły

• **Data:** {{now.date}}, {{now.time}}
• **Zadanie:** {{backup.jobName}}
• **Błąd:** {{backup.errorMessage}}
• **Serwer:** {{backup.serverName}}

## Wymagana akcja

Sprawdź logi backupu i uruchom backup ręcznie jeśli to konieczne. Jeśli błąd się powtarza, sprawdź dostępność przestrzeni dyskowej i poprawność konfiguracji.

[[Otwórz panel administracyjny|{{brand.url}}/admin]]`,
    variables: [
      ...VARS_BRAND,
      ...VARS_TIME,
      {
        key: "backup.jobName",
        label: "Nazwa zadania backup",
        example: "postgres-nightly",
        description: "",
        group: "Backup",
      },
      {
        key: "backup.errorMessage",
        label: "Komunikat błędu",
        example: "Connection timeout after 30s",
        description: "",
        group: "Backup",
      },
      {
        key: "backup.serverName",
        label: "Nazwa serwera",
        example: "vps-myperformance-01",
        description: "",
        group: "Backup",
      },
    ],
  },
  {
    key: "system.cert-expiry-alert",
    category: "system",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Certyfikat CA wygasa",
    description: "Alert do administratora gdy certyfikat CA lub serwera wygasa w ciągu 30 dni",
    editability: "full",
    trigger: "Cron sprawdza daty wygaśnięcia certyfikatów CA i Traefik — tylko do adminów",
    defaultSubject: "[ALERT] Certyfikat {{cert.commonName}} wygasa {{cert.expiryDate}}",
    defaultBody: `# [ALERT] Certyfikat wygasa wkrótce

Certyfikat infrastrukturalny wymaga odnowienia.

## Szczegóły certyfikatu

• **Common Name:** {{cert.commonName}}
• **Data wygaśnięcia:** {{cert.expiryDate}}
• **Dni do wygaśnięcia:** {{cert.daysLeft}}
• **Wystawca:** {{cert.issuer}}
• **Numer seryjny:** {{cert.serial}}

## Wymagana akcja

Odnów certyfikat przed datą wygaśnięcia. Po wygaśnięciu certyfikatu CA wszystkie certyfikaty klientów staną się nieważne, co spowoduje brak dostępu do chronionych paneli.

[[Otwórz panel certyfikatów|{{brand.url}}/admin/certificates]]`,
    variables: [
      ...VARS_BRAND,
      ...VARS_TIME,
      {
        key: "cert.commonName",
        label: "Common Name certyfikatu",
        example: "myperformance.pl CA",
        description: "",
        group: "Certyfikat",
      },
      {
        key: "cert.expiryDate",
        label: "Data wygaśnięcia",
        example: "31 maja 2026",
        description: "Format długi PL",
        group: "Certyfikat",
      },
      {
        key: "cert.daysLeft",
        label: "Dni do wygaśnięcia",
        example: "28",
        description: "",
        group: "Certyfikat",
      },
      {
        key: "cert.issuer",
        label: "Wystawca",
        example: "step-ca MyPerformance Root CA",
        description: "",
        group: "Certyfikat",
      },
      {
        key: "cert.serial",
        label: "Numer seryjny",
        example: "ab:c1:23:...",
        description: "",
        group: "Certyfikat",
      },
    ],
  },

  // ── SYSTEM.group-assigned (istniejący wpis bez zmian) ────────────────────
  {
    key: "system.group-assigned",
    category: "system",
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    name: "Przypisanie do grupy / nadanie uprawnień",
    description: "Admin nadał user-owi nowe uprawnienia",
    editability: "full",
    trigger: "Admin assignuje user-a do grupy KC z UI dashboardu",
    defaultSubject: "Nowe uprawnienia w {{brand.name}}",
    defaultBody: `# Cześć {{user.firstName}}

Administrator nadał Ci dostęp do nowej części platformy.

## Co dostajesz

• **Grupa:** {{group.name}}
• **Aplikacje, które się odblokowały:** {{group.apps}}

## Jak zacząć

Aby zmiana stała się widoczna w przeglądarce, wyloguj się i zaloguj ponownie do dashboardu — uprawnienia są pobierane przy starcie sesji.

[[Otwórz Dashboard|{{brand.url}}]]

---

Jeśli widzisz jakąś aplikację po raz pierwszy, sprawdź zakładkę „Akademia" — tam zwykle jest krótki onboarding wprowadzający w nowe narzędzie.`,
    variables: [
      ...VARS_USER,
      ...VARS_BRAND,
      {
        key: "group.name",
        label: "Nazwa grupy",
        example: "Sprzedawcy",
        description: "Nazwa grupy z Keycloak",
        group: "Grupa",
      },
      {
        key: "group.apps",
        label: "Lista aplikacji",
        example: "Panel Sprzedawcy, Akademia, Knowledge Base",
        description: "Apki które grupa daje",
        group: "Grupa",
      },
    ],
  },
];

export function actionByKey(key: string): CatalogAction | undefined {
  return EMAIL_ACTIONS.find((a) => a.key === key);
}

export function actionsByCategory(): Record<string, CatalogAction[]> {
  const out: Record<string, CatalogAction[]> = {};
  for (const a of EMAIL_ACTIONS) {
    (out[a.category] ??= []).push(a);
  }
  return out;
}

export const CATEGORY_LABELS: Record<CatalogAction["category"], string> = {
  auth: "Autoryzacja i konto",
  account: "Konto użytkownika",
  calendar: "Kalendarz",
  documents: "Dokumenty",
  support: "Obsługa klienta",
  academy: "Akademia (kursy)",
  knowledge: "Knowledge Base",
  service: "Serwis telefonów",
  task: "Zadania i projekty",
  system: "System",
};
