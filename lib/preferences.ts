import { withClient } from "@/lib/db";

/**
 * Notification event types — wszystkie miejsca w serwisie gdzie generujemy
 * powiadomienie do usera. Każdy klucz dostaje 2 niezależne kanały:
 * `inApp` (toast/badge w UI) i `email` (SMTP przez Postal).
 *
 * `requiresArea` filtruje którzy userzy mogą zobaczyć/skonfigurować event:
 *   - null = każdy zalogowany user (osobiste eventy: security, własne konto)
 *   - "infrastructure" = tylko infra adminzy (snapshoty, backupy, security events)
 *   - "documenso" / "moodle" / "chatwoot" = tylko userzy mający dostęp do tej apki
 *
 * `userVisible` (default true): czy event ma się pojawić w bell-icon
 * dropdown (NotificationBell) i toastach.
 *
 * `description`: pełne wyjaśnienie kiedy event się pojawia — pokazywane
 * w PreferencesTab pod label-em (zamiast surowego event_key).
 */
export const NOTIF_EVENTS = {
  "security.login.new_device": {
    label: "Nowe urządzenie loguje się na konto",
    description:
      "Wysyłamy alert gdy widzimy logowanie z nieznanego urządzenia/IP. Pomaga wykryć przejęcie konta.",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: false,
  },
  "security.login.failed": {
    label: "Nieudana próba logowania na Twoje konto",
    description:
      "Pojedyncza nieudana próba logowania (złe hasło/2FA). Większa seria → osobny alert brute-force.",
    category: "security",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: null,
    userVisible: false,
  },
  "security.totp.configured": {
    label: "Skonfigurowano aplikację 2FA",
    description:
      "Potwierdzenie że aplikacja autentykująca (Google Authenticator, Authy) została podpięta do konta.",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: true,
  },
  "security.totp.removed": {
    label: "Usunięto aplikację 2FA",
    description:
      "Aplikacja autentykująca została odłączona od konta. Jeśli to nie Ty — natychmiast skontaktuj się z administratorem.",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: true,
  },
  "security.webauthn.configured": {
    label: "Zarejestrowano klucz bezpieczeństwa / passkey",
    description:
      "Nowy klucz sprzętowy (YubiKey) lub passkey (Touch ID, Face ID) został dodany do konta.",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: true,
  },
  "security.webauthn.removed": {
    label: "Usunięto klucz bezpieczeństwa / passkey",
    description:
      "Klucz sprzętowy lub passkey został usunięty z konta. Jeśli to nie Ty — natychmiast skontaktuj się z administratorem.",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: true,
  },

  "knowledge.mention": {
    label: "Wspomniano o Tobie w dokumencie (Knowledge)",
    description:
      "Ktoś użył `@TwojaNazwa` w treści dokumentu lub komentarza w Outline.",
    category: "apps",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "knowledge",
  },
  "knowledge.comment.created": {
    label: "Nowy komentarz w dokumencie (Knowledge)",
    description:
      "Pod jednym z Twoich dokumentów pojawił się komentarz innego użytkownika.",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "knowledge",
  },
  "knowledge.document.published": {
    label: "Opublikowano dokument w Knowledge",
    description:
      "Twój własny dokument został opublikowany (przeszedł ze stanu draft).",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "knowledge",
  },
  "knowledge.document.updated": {
    label: "Zaktualizowano dokument w Knowledge",
    description:
      "Aktualizacja treści dokumentu którego jesteś autorem (revisions/edycje).",
    category: "apps",
    defaultInApp: false,
    defaultEmail: false,
    requiresArea: "knowledge",
  },
  "security.brute_force.detected": {
    label: "Wykryto brute force na Twoim koncie",
    description:
      "Wykryto serię nieudanych prób logowania w krótkim czasie. Konto może być atakowane.",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: false,
  },
  "security.password.changed": {
    label: "Zmieniono hasło",
    description:
      "Hasło do konta zostało zmienione (przez Ciebie lub przez admina). Jeśli to nie Ty — działaj natychmiast.",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: false,
  },

  "account.role.assigned": {
    label: "Przypisano nową rolę",
    description:
      "Administrator nadał Ci nowy poziom dostępu (np. dokumenty, panele sprzedawcy, akademia).",
    category: "account",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: null,
  },
  "account.role.revoked": {
    label: "Cofnięto rolę",
    description:
      "Administrator zabrał jeden z poziomów dostępu. Niektóre funkcje mogą stać się niedostępne.",
    category: "account",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: null,
  },
  "account.cert.issued": {
    label: "Wystawiono certyfikat klienta",
    description:
      "Wygenerowano dla Ciebie certyfikat mTLS — niezbędny do logowania do paneli sprzedawcy/serwisanta/kierowcy.",
    category: "account",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
  },
  "account.cert.expiring": {
    label: "Certyfikat wygasa za <14 dni",
    description:
      "Twój certyfikat klienta jest blisko wygaśnięcia. Po wygaśnięciu stracisz dostęp do paneli — wygeneruj nowy.",
    category: "account",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
  },

  "documents.signature.requested": {
    label: "Prośba o podpis dokumentu",
    description:
      "Otrzymałeś dokument do podpisu w Documenso. Otwórz Documenso żeby zaakceptować lub odrzucić.",
    category: "apps",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "documenso",
  },
  "documents.signature.completed": {
    label: "Dokument podpisany",
    description:
      "Dokument który wysłałeś został podpisany przez wszystkich odbiorców.",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "documenso",
  },
  "moodle.course.assigned": {
    label: "Przypisano do kursu Moodle",
    description:
      "Zostałeś zapisany na nowy kurs w Akademii. Wejdź żeby zobaczyć materiały.",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "moodle",
  },
  "chatwoot.conversation.assigned": {
    label: "Przypisano do rozmowy Chatwoot",
    description:
      "Otrzymałeś nową rozmowę z klientem do obsłużenia w Chatwoot.",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "chatwoot",
  },
  "chatwoot.message.new": {
    label: "Nowa wiadomość od klienta (Chatwoot)",
    description:
      "Klient odpisał w prowadzonej przez Ciebie rozmowie. Otwórz Chatwoot żeby odpowiedzieć.",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "chatwoot",
  },
  "chatwoot.unread_message": {
    label: "Nieprzeczytana wiadomość w Chatwoocie",
    description:
      "Wiadomość od klienta z poziomu skrzynki, do której masz dostęp, lecz która nie ma jeszcze przypisanego agenta.",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "chatwoot",
  },
  "chatwoot.conversation.resolved": {
    label: "Rozmowa oznaczona jako rozwiązana (Chatwoot)",
    description:
      "Twoja rozmowa z klientem została zamknięta (przez Ciebie, kolegę z zespołu lub auto-resolve).",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "chatwoot",
  },
  "moodle.grade.received": {
    label: "Otrzymano ocenę w Akademii (Moodle)",
    description:
      "Trener wystawił Ci ocenę z zadania. Wejdź do kursu żeby zobaczyć szczegóły.",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "moodle",
  },
  "moodle.group.joined": {
    label: "Dołączono do grupy w kursie (Moodle)",
    description:
      "Trener przypisał Cię do nowej grupy w obrębie kursu (np. zespół projektowy).",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "moodle",
  },

  "admin.snapshot.created": {
    label: "Utworzono snapshot VPS",
    description:
      "Codzienny snapshot serwera został utworzony pomyślnie (audit infra).",
    category: "admin",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "infrastructure",
  },
  "admin.snapshot.failed": {
    label: "Snapshot VPS nie powiódł się",
    description:
      "Snapshot się nie powiódł — sprawdź logi infrastruktury (OVH/Coolify) i wymuś manual snapshot.",
    category: "admin",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "infrastructure",
  },
  "admin.backup.completed": {
    label: "Backup nocny wykonany",
    description:
      "Plan zapasowy bazy + plików zakończony. Sprawdź rotację retention w razie potrzeby.",
    category: "admin",
    defaultInApp: false,
    defaultEmail: true,
    requiresArea: "infrastructure",
  },
  "admin.backup.failed": {
    label: "Backup nie powiódł się",
    description:
      "Backup nie zakończył się powodzeniem. Sprawdź logi i upewnij się że disaster recovery jest na miejscu.",
    category: "admin",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "infrastructure",
  },
  "admin.security.event.high": {
    label: "Wykryto zdarzenie bezpieczeństwa (high/critical)",
    description:
      "Wazuh wykrył zdarzenie o wysokim priorytecie (eskalacja uprawnień, podejrzane logowania, malware).",
    category: "admin",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "infrastructure",
  },
  "admin.ip.auto_blocked": {
    label: "Auto-zablokowano IP (Wazuh AR)",
    description:
      "Wazuh automatic response zablokował podejrzane IP (brute-force, scanning). Sprawdź panel security.",
    category: "admin",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "infrastructure",
  },
} as const;

export type NotifEventKey = keyof typeof NOTIF_EVENTS;

export interface UserPreferences {
  hintsEnabled: boolean;
  notifInApp: Partial<Record<NotifEventKey, boolean>>;
  notifEmail: Partial<Record<NotifEventKey, boolean>>;
  introCompletedSteps: string[];
  moodleCourseId?: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  hintsEnabled: true,
  notifInApp: {},
  notifEmail: {},
  introCompletedSteps: [],
};

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_user_preferences (
        user_id     TEXT PRIMARY KEY,
        prefs       JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  });
  schemaReady = true;
}

export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  await ensureSchema();
  const r = await withClient((c) =>
    c.query<{ prefs: UserPreferences }>(
      `SELECT prefs FROM mp_user_preferences WHERE user_id = $1`,
      [userId],
    ),
  );
  if (r.rows.length === 0) return DEFAULT_PREFERENCES;
  const stored = r.rows[0].prefs ?? {};
  return {
    hintsEnabled: stored.hintsEnabled ?? true,
    notifInApp: stored.notifInApp ?? {},
    notifEmail: stored.notifEmail ?? {},
    introCompletedSteps: stored.introCompletedSteps ?? [],
    moodleCourseId: stored.moodleCourseId,
  };
}

export async function setUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<void> {
  await ensureSchema();
  const current = await getUserPreferences(userId);
  const merged: UserPreferences = {
    hintsEnabled: patch.hintsEnabled ?? current.hintsEnabled,
    notifInApp: { ...current.notifInApp, ...(patch.notifInApp ?? {}) },
    notifEmail: { ...current.notifEmail, ...(patch.notifEmail ?? {}) },
    introCompletedSteps:
      patch.introCompletedSteps ?? current.introCompletedSteps,
    moodleCourseId: patch.moodleCourseId ?? current.moodleCourseId,
  };
  await withClient((c) =>
    c.query(
      `INSERT INTO mp_user_preferences (user_id, prefs)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
      [userId, JSON.stringify(merged)],
    ),
  );
}

export function shouldNotify(
  prefs: UserPreferences,
  event: NotifEventKey,
  channel: "inApp" | "email",
): boolean {
  const def = NOTIF_EVENTS[event];
  if (!def) return false;
  const userOverride =
    channel === "inApp" ? prefs.notifInApp[event] : prefs.notifEmail[event];
  if (typeof userOverride === "boolean") return userOverride;
  return channel === "inApp" ? def.defaultInApp : def.defaultEmail;
}

export function isUserVisibleEvent(eventKey: string): boolean {
  const def = (NOTIF_EVENTS as Record<string, { userVisible?: boolean }>)[
    eventKey
  ];
  if (!def) return true;
  return def.userVisible !== false;
}
