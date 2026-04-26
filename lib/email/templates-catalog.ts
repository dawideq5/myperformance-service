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
  category: "auth" | "calendar" | "documents" | "support" | "academy" | "knowledge" | "system";
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
  calendar: "Kalendarz",
  documents: "Dokumenty",
  support: "Obsługa klienta",
  academy: "Akademia (kursy)",
  knowledge: "Knowledge Base",
  system: "System",
};
