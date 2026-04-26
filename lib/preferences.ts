import { withClient } from "@/lib/db";

/**
 * Notification event types — wszystkie miejsca w serwisie gdzie generujemy
 * powiadomienie do usera. Każdy klucz dostaje 2 niezależne kanały:
 * `inApp` (toast/badge w UI) i `email` (SMTP przez Postal).
 *
 * Default polityka: critical security / login alerts ZAWSZE on (email
 * też), reszta domyślnie tylko inApp.
 */
export const NOTIF_EVENTS = {
  // Bezpieczeństwo
  "security.login.new_device": {
    label: "Nowe urządzenie loguje się na konto",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
  },
  "security.login.failed": {
    label: "Nieudana próba logowania na Twoje konto",
    category: "security",
    defaultInApp: true,
    defaultEmail: false,
  },
  "security.2fa.code_sent": {
    label: "Wysłano kod 2FA",
    category: "security",
    defaultInApp: true,
    defaultEmail: false,
  },
  "security.brute_force.detected": {
    label: "Wykryto brute force na Twoim koncie",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
  },
  "security.password.changed": {
    label: "Zmieniono hasło",
    category: "security",
    defaultInApp: true,
    defaultEmail: true,
  },

  // Konto
  "account.role.assigned": {
    label: "Przypisano nową rolę",
    category: "account",
    defaultInApp: true,
    defaultEmail: false,
  },
  "account.role.revoked": {
    label: "Cofnięto rolę",
    category: "account",
    defaultInApp: true,
    defaultEmail: false,
  },
  "account.cert.issued": {
    label: "Wystawiono certyfikat klienta",
    category: "account",
    defaultInApp: true,
    defaultEmail: true,
  },
  "account.cert.expiring": {
    label: "Certyfikat wygasa za <14 dni",
    category: "account",
    defaultInApp: true,
    defaultEmail: true,
  },

  // Aplikacje
  "documents.signature.requested": {
    label: "Prośba o podpis dokumentu",
    category: "apps",
    defaultInApp: true,
    defaultEmail: true,
  },
  "documents.signature.completed": {
    label: "Dokument podpisany",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
  },
  "moodle.course.assigned": {
    label: "Przypisano do kursu Moodle",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
  },
  "chatwoot.conversation.assigned": {
    label: "Przypisano do rozmowy Chatwoot",
    category: "apps",
    defaultInApp: true,
    defaultEmail: false,
  },

  // Admin (tylko dla admin roles)
  "admin.snapshot.created": {
    label: "Utworzono snapshot VPS",
    category: "admin",
    defaultInApp: true,
    defaultEmail: false,
  },
  "admin.snapshot.failed": {
    label: "Snapshot VPS nie powiódł się",
    category: "admin",
    defaultInApp: true,
    defaultEmail: true,
  },
  "admin.backup.completed": {
    label: "Backup nocny wykonany",
    category: "admin",
    defaultInApp: false,
    defaultEmail: true,
  },
  "admin.backup.failed": {
    label: "Backup nie powiódł się",
    category: "admin",
    defaultInApp: true,
    defaultEmail: true,
  },
  "admin.security.event.high": {
    label: "Wykryto zdarzenie bezpieczeństwa (high/critical)",
    category: "admin",
    defaultInApp: true,
    defaultEmail: true,
  },
  "admin.ip.auto_blocked": {
    label: "Auto-zablokowano IP (Wazuh AR)",
    category: "admin",
    defaultInApp: true,
    defaultEmail: false,
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
