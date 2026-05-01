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
 * dropdown (NotificationBell) i toastach. Eventy security.* są zapisywane
 * do mp_inbox jako audit trail (i dalej trafiają na email gdy user ma email
 * channel włączony), ale NIE pokazujemy ich w UI dropdown — user nie chce
 * widzieć "security.login.new_device" obok "Nowa wiadomość w Chatwoocie".
 *
 * Filtrowanie jest na poziomie:
 *   - PreferencesTab UI (matrix nie pokazuje eventów do których brak dostępu)
 *   - notifyUser dispatcher (gate przy sendzie — nie warto pchać do mp_inbox
 *     userowi który i tak nie zobaczy ze względu na uprawnienia)
 *   - GET /api/account/inbox (user-facing) — odfiltrowuje userVisible:false
 */
export const NOTIF_EVENTS = {
  // Bezpieczeństwo — każdy zalogowany user (dotyczy własnego konta).
  // userVisible:false → nie pokazujemy w bell dropdown (techniczny szum),
  // ale dalej zapisujemy do mp_inbox jako audit + email gdy włączony.
  "security.login.new_device": {
    label: "Nowe urządzenie loguje się na konto",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: false,
  },
  "security.login.failed": {
    label: "Nieudana próba logowania na Twoje konto",
    category: "security",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: null,
    userVisible: false,
  },
  "security.totp.configured": {
    label: "Skonfigurowano aplikację 2FA",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: true,
  },
  "security.totp.removed": {
    label: "Usunięto aplikację 2FA",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: true,
  },
  "security.webauthn.configured": {
    label: "Zarejestrowano klucz bezpieczeństwa / passkey",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: true,
  },
  "security.webauthn.removed": {
    label: "Usunięto klucz bezpieczeństwa / passkey",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: true,
  },

  // Knowledge / Outline — comments, mentions, document publish.
  "knowledge.mention": {
    label: "Wspomniano o Tobie w dokumencie (Knowledge)",
    category: "apps",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "knowledge",
  },
  "knowledge.comment.created": {
    label: "Nowy komentarz w dokumencie (Knowledge)",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "knowledge",
  },
  "knowledge.document.published": {
    label: "Opublikowano dokument w Knowledge",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "knowledge",
  },
  "knowledge.document.updated": {
    label: "Zaktualizowano dokument w Knowledge",
    category: "apps",
    defaultInApp: false,
    defaultEmail: false,
    requiresArea: "knowledge",
  },
  "security.brute_force.detected": {
    label: "Wykryto brute force na Twoim koncie",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: false,
  },
  "security.password.changed": {
    label: "Zmieniono hasło",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
    userVisible: false,
  },

  // Konto — własne. Każdy user. Cert events tylko dla userów mających cert
  // (sprzedawca/serwisant/kierowca area), ale zostawmy null żeby user zawsze
  // zobaczył ważne info.
  "account.role.assigned": {
    label: "Przypisano nową rolę",
    category: "account",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: null,
  },
  "account.role.revoked": {
    label: "Cofnięto rolę",
    category: "account",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: null,
  },
  "account.cert.issued": {
    label: "Wystawiono certyfikat klienta",
    category: "account",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
  },
  "account.cert.expiring": {
    label: "Certyfikat wygasa za <14 dni",
    category: "account",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: null,
  },

  // Aplikacje — tylko userzy z dostępem do danej apki
  "documents.signature.requested": {
    label: "Prośba o podpis dokumentu",
    category: "apps",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "documenso",
  },
  "documents.signature.completed": {
    label: "Dokument podpisany",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "documenso",
  },
  "moodle.course.assigned": {
    label: "Przypisano do kursu Moodle",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "moodle",
  },
  "chatwoot.conversation.assigned": {
    label: "Przypisano do rozmowy Chatwoot",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "chatwoot",
  },
  "chatwoot.message.new": {
    label: "Nowa wiadomość od klienta (Chatwoot)",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "chatwoot",
  },
  "chatwoot.unread_message": {
    label: "Nieprzeczytana wiadomość w Chatwoocie",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "chatwoot",
  },
  "chatwoot.conversation.resolved": {
    label: "Rozmowa oznaczona jako rozwiązana (Chatwoot)",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "chatwoot",
  },
  "moodle.grade.received": {
    label: "Otrzymano ocenę w Akademii (Moodle)",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "moodle",
  },
  "moodle.group.joined": {
    label: "Dołączono do grupy w kursie (Moodle)",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "moodle",
  },

  // Admin — TYLKO infra/security adminzy widzą te zdarzenia
  "admin.snapshot.created": {
    label: "Utworzono snapshot VPS",
    category: "admin",
    defaultInApp: true,
    defaultEmail: false,
    requiresArea: "infrastructure",
  },
  "admin.snapshot.failed": {
    label: "Snapshot VPS nie powiódł się",
    category: "admin",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "infrastructure",
  },
  "admin.backup.completed": {
    label: "Backup nocny wykonany",
    category: "admin",
    defaultInApp: false,
    defaultEmail: true,
    requiresArea: "infrastructure",
  },
  "admin.backup.failed": {
    label: "Backup nie powiódł się",
    category: "admin",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "infrastructure",
  },
  "admin.security.event.high": {
    label: "Wykryto zdarzenie bezpieczeństwa (high/critical)",
    category: "admin",
    defaultInApp: true,
    defaultEmail: true,
    requiresArea: "infrastructure",
  },
  "admin.ip.auto_blocked": {
    label: "Auto-zablokowano IP (Wazuh AR)",
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

const DEFAULT_PREFS: UserPreferences = {
  hintsEnabled: true,
  notifInApp: {},
  notifEmail: {},
  introCompletedSteps: [],
};

export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  return withClient(async (c) => {
    const r = await c.query<{ prefs: Record<string, unknown> }>(
      `SELECT prefs FROM mp_user_preferences WHERE user_id = $1`,
      [userId],
    );
    const stored = (r.rows[0]?.prefs ?? {}) as Partial<UserPreferences>;
    return {
      hintsEnabled: stored.hintsEnabled ?? DEFAULT_PREFS.hintsEnabled,
      notifInApp: { ...DEFAULT_PREFS.notifInApp, ...(stored.notifInApp ?? {}) },
      notifEmail: { ...DEFAULT_PREFS.notifEmail, ...(stored.notifEmail ?? {}) },
      introCompletedSteps:
        stored.introCompletedSteps ?? DEFAULT_PREFS.introCompletedSteps,
      moodleCourseId: stored.moodleCourseId,
    };
  });
}

export async function setUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const current = await getUserPreferences(userId);
  const next: UserPreferences = {
    hintsEnabled: patch.hintsEnabled ?? current.hintsEnabled,
    notifInApp: { ...current.notifInApp, ...(patch.notifInApp ?? {}) },
    notifEmail: { ...current.notifEmail, ...(patch.notifEmail ?? {}) },
    introCompletedSteps:
      patch.introCompletedSteps ?? current.introCompletedSteps,
    moodleCourseId: patch.moodleCourseId ?? current.moodleCourseId,
  };
  await withClient((c) =>
    c.query(
      `INSERT INTO mp_user_preferences (user_id, prefs, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
      [userId, JSON.stringify(next)],
    ),
  );
  return next;
}

/**
 * Sprawdza czy user dostaje powiadomienie. Łączy default policy z user override.
 */
export function shouldNotify(
  prefs: UserPreferences,
  event: NotifEventKey,
  channel: "inApp" | "email",
): boolean {
  const def = NOTIF_EVENTS[event];
  if (!def) return false;
  const override =
    channel === "inApp" ? prefs.notifInApp[event] : prefs.notifEmail[event];
  if (typeof override === "boolean") return override;
  return channel === "inApp" ? def.defaultInApp : def.defaultEmail;
}

/**
 * Czy event powinien być pokazany w bell-icon dropdown / toastach.
 *
 * Domyślnie `true`. Eventy security.* (login.new_device, brute_force,
 * webauthn.*, totp.*, password.changed, login.failed) mają `userVisible:false`
 * — są zapisywane do mp_inbox jako audit trail i wysyłane mailem (gdy user
 * opt-in), ale NIE pojawiają się w UI dropdown — to "techniczny szum"
 * którego user nie chce widzieć obok user-facing powiadomień typu "Nowa
 * wiadomość w Chatwoocie".
 *
 * Funkcja akceptuje `string` (nie `NotifEventKey`) bo używamy jej w API
 * route na surowych event_key z DB — historyczne mogą być spoza catalog
 * (po refactorze key bywały zmieniane).
 */
export function isUserVisibleEvent(eventKey: string): boolean {
  const def = (NOTIF_EVENTS as Record<string, { userVisible?: boolean }>)[
    eventKey
  ];
  if (!def) return true;
  return def.userVisible !== false;
}

/**
 * Lista event_keys które są "user-visible" — używana przez API
 * GET /api/account/inbox jako whitelist filter.
 */
export function userVisibleEventKeys(): string[] {
  return Object.entries(NOTIF_EVENTS)
    .filter(([, def]) => (def as { userVisible?: boolean }).userVisible !== false)
    .map(([key]) => key);
}
