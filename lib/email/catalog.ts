/**
 * Statyczny katalog wszystkich emaili wysyłanych przez stack myperformance.
 * Zaktualizowany manualnie po audycie każdej apki. UI w `/admin/email`
 * pokazuje go jako read-only inventory + linki do edycji tam gdzie
 * provider pozwala (KC localization, branding propagation).
 *
 * Struktura entry:
 *   - app          — id aplikacji (jak w lib/permissions/areas)
 *   - id           — krótki id template (kebab-case)
 *   - name         — pl nazwa
 *   - trigger      — kiedy się wysyła
 *   - variables    — lista placeholderów dostępnych w treści
 *   - attachments  — lista typów załączników (np. "Generated PKCS12")
 *   - editable     — gdzie edytujemy: kc-localization | source-fork | branding-only
 */

export interface EmailVariable {
  key: string;
  description: string;
}

export interface EmailAttachment {
  type: "auto" | "static" | "user-upload";
  name: string;
  description: string;
}

export type EmailEditable =
  | { kind: "kc-localization"; subjectKey: string; bodyKey: string }
  | { kind: "branding-only"; note: string }
  | { kind: "source-fork"; sourceLink: string };

export interface EmailCatalogEntry {
  app: string;
  appLabel: string;
  id: string;
  name: string;
  trigger: string;
  variables: EmailVariable[];
  attachments: EmailAttachment[];
  editable: EmailEditable;
}

export const EMAIL_CATALOG: EmailCatalogEntry[] = [
  // ── Keycloak ──────────────────────────────────────────────────────────────
  {
    app: "keycloak",
    appLabel: "Keycloak",
    id: "verify-email",
    name: "Weryfikacja adresu email",
    trigger: "Po rejestracji lub zmianie adresu email — wymagane potwierdzenie",
    variables: [
      { key: "user.firstName", description: "Imię użytkownika" },
      { key: "user.email", description: "Adres email" },
      { key: "link", description: "Link weryfikacyjny (1-time)" },
      { key: "linkExpirationFormatter", description: "Czas ważności linku" },
      { key: "realmName", description: "Display name realm-u" },
    ],
    attachments: [],
    editable: {
      kind: "kc-localization",
      subjectKey: "emailVerificationSubject",
      bodyKey: "emailVerificationBodyHtml",
    },
  },
  {
    app: "keycloak",
    appLabel: "Keycloak",
    id: "password-reset",
    name: "Reset hasła",
    trigger: "User kliknął „Zapomniałem hasła\" lub admin wysłał reset",
    variables: [
      { key: "user.firstName", description: "Imię" },
      { key: "link", description: "Link do resetu" },
      { key: "linkExpirationFormatter", description: "Czas ważności" },
    ],
    attachments: [],
    editable: {
      kind: "kc-localization",
      subjectKey: "passwordResetSubject",
      bodyKey: "passwordResetBodyHtml",
    },
  },
  {
    app: "keycloak",
    appLabel: "Keycloak",
    id: "executable-action",
    name: "Wymagana akcja (np. zmiana hasła)",
    trigger: "Admin wymusi required-action via Admin API",
    variables: [
      { key: "user.firstName", description: "Imię" },
      { key: "link", description: "Link akcji" },
      { key: "requiredActions", description: "Lista akcji do wykonania" },
    ],
    attachments: [],
    editable: {
      kind: "kc-localization",
      subjectKey: "executeActionsSubject",
      bodyKey: "executeActionsBodyHtml",
    },
  },
  {
    app: "keycloak",
    appLabel: "Keycloak",
    id: "email-update-confirmation",
    name: "Potwierdzenie zmiany emaila",
    trigger: "User zmienił email — KC wysyła link potwierdzający na nowy adres",
    variables: [
      { key: "user.firstName", description: "Imię" },
      { key: "newEmail", description: "Nowy adres" },
      { key: "link", description: "Link potwierdzający" },
    ],
    attachments: [],
    editable: {
      kind: "kc-localization",
      subjectKey: "emailUpdateConfirmationSubject",
      bodyKey: "emailUpdateConfirmationBodyHtml",
    },
  },
  {
    app: "keycloak",
    appLabel: "Keycloak",
    id: "identity-provider-link",
    name: "Powiązanie konta z dostawcą zewnętrznym (Google itd.)",
    trigger: "User loguje się przez IdP, KC wymaga potwierdzenia powiązania",
    variables: [
      { key: "user.firstName", description: "Imię" },
      { key: "identityProviderContext.username", description: "Username z IdP" },
      { key: "link", description: "Link potwierdzający" },
    ],
    attachments: [],
    editable: {
      kind: "kc-localization",
      subjectKey: "identityProviderLinkSubject",
      bodyKey: "identityProviderLinkBodyHtml",
    },
  },

  // ── Documenso ─────────────────────────────────────────────────────────────
  {
    app: "documenso",
    appLabel: "Documenso (Centrum Dokumentów)",
    id: "signing-request",
    name: "Prośba o podpis dokumentu",
    trigger: "Wysłany dokument do podpisu wygenerował zaproszenie",
    variables: [
      { key: "recipient.name", description: "Imię odbiorcy" },
      { key: "recipient.email", description: "Email odbiorcy" },
      { key: "document.title", description: "Tytuł dokumentu" },
      { key: "sender.name", description: "Imię nadawcy" },
      { key: "sender.email", description: "Email nadawcy" },
      { key: "signUrl", description: "Link do podpisu" },
      { key: "expiresAt", description: "Data wygaśnięcia" },
    ],
    attachments: [
      {
        type: "auto",
        name: "Dokument PDF (preview)",
        description: "Preview PDF generowany dynamicznie przez Documenso",
      },
    ],
    editable: {
      kind: "source-fork",
      sourceLink:
        "https://github.com/documenso/documenso/tree/main/packages/email/templates",
    },
  },
  {
    app: "documenso",
    appLabel: "Documenso",
    id: "signing-completed",
    name: "Dokument podpisany — dystrybucja",
    trigger: "Wszyscy odbiorcy podpisali — wysyłka kopii do każdego",
    variables: [
      { key: "recipient.name", description: "Imię odbiorcy" },
      { key: "document.title", description: "Tytuł dokumentu" },
      { key: "downloadUrl", description: "Link pobrania finalnego PDF" },
    ],
    attachments: [
      {
        type: "auto",
        name: "Podpisany PDF + audit trail",
        description:
          "Finalny PDF z podpisami + audit trail PDF (zgodne z eIDAS LTV)",
      },
    ],
    editable: {
      kind: "source-fork",
      sourceLink:
        "https://github.com/documenso/documenso/tree/main/packages/email/templates",
    },
  },
  {
    app: "documenso",
    appLabel: "Documenso",
    id: "signing-reminder",
    name: "Przypomnienie o niepodpisanym dokumencie",
    trigger: "Cron — odbiorca nie podpisał w X dni",
    variables: [
      { key: "recipient.name", description: "Imię odbiorcy" },
      { key: "document.title", description: "Tytuł" },
      { key: "signUrl", description: "Link do podpisu" },
      { key: "daysRemaining", description: "Dni do wygaśnięcia" },
    ],
    attachments: [],
    editable: {
      kind: "source-fork",
      sourceLink:
        "https://github.com/documenso/documenso/tree/main/packages/email/templates",
    },
  },

  // ── Chatwoot ──────────────────────────────────────────────────────────────
  {
    app: "chatwoot",
    appLabel: "Chatwoot (Obsługa klienta)",
    id: "agent-assigned",
    name: "Powiadomienie o przypisaniu konwersacji",
    trigger: "Konwersacja zostaje przypisana do agenta",
    variables: [
      { key: "agent.name", description: "Imię agenta" },
      { key: "conversation.id", description: "ID konwersacji" },
      { key: "conversation.url", description: "Link do konwersacji w Chatwoot" },
      { key: "customer.name", description: "Imię klienta" },
    ],
    attachments: [],
    editable: {
      kind: "branding-only",
      note: "Treść w Rails ERB. Tylko brand vars (INSTALLATION_NAME, BRAND_URL) edytowalne via env.",
    },
  },
  {
    app: "chatwoot",
    appLabel: "Chatwoot",
    id: "password-reset",
    name: "Reset hasła agenta",
    trigger: "Agent kliknął „Forgot password\"",
    variables: [
      { key: "agent.name", description: "Imię" },
      { key: "resetUrl", description: "Link resetu" },
    ],
    attachments: [],
    editable: {
      kind: "branding-only",
      note: "Treść w Rails ERB. Tylko brand vars edytowalne.",
    },
  },

  // ── Moodle ────────────────────────────────────────────────────────────────
  {
    app: "moodle",
    appLabel: "MyPerformance Academy (Moodle)",
    id: "course-enrollment",
    name: "Powiadomienie o zapisaniu na kurs",
    trigger: "User zostaje zapisany na kurs",
    variables: [
      { key: "user.firstname", description: "Imię" },
      { key: "course.fullname", description: "Pełna nazwa kursu" },
      { key: "course.url", description: "Link do kursu" },
      { key: "siteurl", description: "URL Moodla" },
    ],
    attachments: [],
    editable: {
      kind: "branding-only",
      note: "Treść w język strings (mdl_config). Edycja przez Moodle Admin → Languages → Customise PL.",
    },
  },
  {
    app: "moodle",
    appLabel: "Moodle",
    id: "new-login-notice",
    name: "Powiadomienie o nowym logowaniu",
    trigger: "Login z nowego urządzenia/IP",
    variables: [
      { key: "user.firstname", description: "Imię" },
      { key: "user.email", description: "Email" },
      { key: "loginTime", description: "Data i godzina logowania" },
      { key: "userAgent", description: "Nazwa przeglądarki / urządzenia" },
      { key: "ipAddress", description: "Adres IP" },
    ],
    attachments: [],
    editable: {
      kind: "branding-only",
      note: "Treść hardcoded w Moodle core. Edycja wymaga forka.",
    },
  },

  // ── Outline ───────────────────────────────────────────────────────────────
  {
    app: "outline",
    appLabel: "Outline (Knowledge Base)",
    id: "invitation",
    name: "Zaproszenie do workspace",
    trigger: "Admin zaprasza nowego user-a",
    variables: [
      { key: "invitee.name", description: "Imię zaproszonego" },
      { key: "inviter.name", description: "Imię zapraszającego" },
      { key: "team.name", description: "Nazwa workspace" },
      { key: "joinUrl", description: "Link aktywacyjny" },
    ],
    attachments: [],
    editable: {
      kind: "source-fork",
      sourceLink: "https://github.com/outline/outline/tree/main/server/emails/templates",
    },
  },
  {
    app: "outline",
    appLabel: "Outline",
    id: "document-mention",
    name: "Wzmianka w dokumencie (@mention)",
    trigger: "Ktoś oznaczył ciebie w dokumencie",
    variables: [
      { key: "actor.name", description: "Kto wzmiankuje" },
      { key: "document.title", description: "Tytuł dokumentu" },
      { key: "document.url", description: "Link do dokumentu" },
    ],
    attachments: [],
    editable: {
      kind: "source-fork",
      sourceLink: "https://github.com/outline/outline/tree/main/server/emails/templates",
    },
  },

  // ── Directus ──────────────────────────────────────────────────────────────
  {
    app: "directus",
    appLabel: "Directus (CMS)",
    id: "password-reset",
    name: "Reset hasła administratora CMS",
    trigger: "Admin CMS klika „Forgot password\"",
    variables: [
      { key: "url", description: "Link resetu" },
      { key: "user.first_name", description: "Imię" },
    ],
    attachments: [],
    editable: {
      kind: "branding-only",
      note: "Domyślny template Directus. Custom templates wymagają mountu /extensions/email-templates.",
    },
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  {
    app: "dashboard",
    appLabel: "MyPerformance Dashboard",
    id: "cert-delivery",
    name: "Wystawiony certyfikat klienta (mTLS)",
    trigger: "Admin wystawił cert w `/admin/certificates`",
    variables: [
      { key: "subject", description: "CN certyfikatu (Imię i nazwisko)" },
      { key: "filename", description: "Nazwa pliku .p12" },
      { key: "password", description: "Hasło do .p12 (one-time)" },
      { key: "validUntil", description: "Data wygaśnięcia" },
      { key: "roles", description: "Lista paneli, do których cert daje dostęp" },
    ],
    attachments: [
      {
        type: "auto",
        name: "PKCS12 bundle",
        description: "Plik .p12 z kluczem prywatnym + certem (auto-generated)",
      },
    ],
    editable: {
      kind: "source-fork",
      sourceLink: "lib/cert-delivery.ts (in repo)",
    },
  },
];

export function getCatalogByApp(): Record<string, EmailCatalogEntry[]> {
  const out: Record<string, EmailCatalogEntry[]> = {};
  for (const e of EMAIL_CATALOG) {
    (out[e.app] ??= []).push(e);
  }
  return out;
}
