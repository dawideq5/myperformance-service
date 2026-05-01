import { withClient } from "@/lib/db";
import { keycloak } from "@/lib/keycloak";
import { sendMail } from "@/lib/smtp";
import { log } from "@/lib/logger";
import {
  NOTIF_EVENTS,
  getUserPreferences,
  shouldNotify,
  type NotifEventKey,
} from "@/lib/preferences";

export type Severity = "info" | "warning" | "error" | "success";

export interface NotifyContext {
  /** Tytuł toast / subject email-a. */
  title: string;
  /** Treść — plain text dla emaila i in-app. */
  body: string;
  /** Severity dla UI tone. Default: info. */
  severity?: Severity;
  /** Dowolny structured payload — zapisywany w mp_inbox.payload. */
  payload?: Record<string, unknown>;
  /** Force email mimo polityki prefs (np. system-critical). */
  forceEmail?: boolean;
}

interface KeycloakUserRow {
  email?: string;
  firstName?: string;
  enabled?: boolean;
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const adminToken = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(`/users/${userId}`, adminToken);
    if (!res.ok) return null;
    const data = (await res.json()) as KeycloakUserRow;
    return data.email ?? null;
  } catch (err) {
    log.warn("notify.kc_lookup_failed", { userId, err: String(err) });
    return null;
  }
}

function renderEmail(title: string, body: string, severity: Severity): string {
  const accent =
    severity === "error"
      ? "#dc2626"
      : severity === "warning"
        ? "#d97706"
        : severity === "success"
          ? "#059669"
          : "#6366f1";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#f7f7fa;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <div style="height:4px;background:${accent};"></div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 12px;font-size:18px;color:#1a1a1f;">${escapeHtml(title)}</h1>
      <div style="font-size:14px;color:#4b5563;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body)}</div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e5ea;font-size:12px;color:#9ca3af;">
        Otrzymałeś tę wiadomość, ponieważ jesteś userem MyPerformance.
        Możesz zarządzać powiadomieniami w
        <a href="https://myperformance.pl/account?tab=preferences" style="color:${accent};">Preferencjach</a>.
      </div>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );
}

/**
 * Centralna funkcja powiadomień. Łączy:
 * - politykę usera (`prefs.notifInApp[event]` + `prefs.notifEmail[event]`),
 * - default polityki (`NOTIF_EVENTS[event].defaultInApp/Email`),
 * - persystencję in-app (`mp_inbox`),
 * - email (przez SMTP `lib/smtp.ts`).
 *
 * Funkcja jest non-throwing — błąd kanału nie blokuje akcji wywołującej.
 * Loguje przez `log` żeby było co debugować.
 *
 * Wersja best-effort: nie czekamy na SMTP w foreground call (fire-and-forget
 * z catch). Jeśli ważne — `await` po stronie wywołującej.
 */
export async function notifyUser(
  userId: string,
  event: NotifEventKey,
  ctx: NotifyContext,
): Promise<void> {
  const def = NOTIF_EVENTS[event];
  if (!def) {
    log.warn("notify.unknown_event", { event });
    return;
  }

  // Sprawdź czy user ma uprawnienia do tego eventu (requiresArea). Bez tego
  // user dostaje powiadomienia o akcjach których nie powinien widzieć
  // (np. zwykły user dostawał info o "snapshot VPS failed"). Filter też w
  // PreferencesTab UI — ale ten gate jest server-side last line of defense.
  const ra = (def as { requiresArea?: string | null }).requiresArea;
  if (ra) {
    try {
      const { keycloak } = await import("@/lib/keycloak");
      const adminToken = await keycloak.getServiceAccountToken();
      const res = await keycloak.adminRequest(
        `/users/${userId}/role-mappings/realm/composite`,
        adminToken,
      );
      if (res.ok) {
        const roles = (await res.json()) as Array<{ name?: string }>;
        const roleNames = roles.map((r) => r.name).filter((n): n is string => !!n);
        const { userHasAreaClient } = await import("@/lib/permissions/access-client");
        if (!userHasAreaClient(roleNames, ra)) {
          // User nie ma area access → pomijamy notify całkowicie
          return;
        }
      }
    } catch (err) {
      // KC unavailable → pomijamy gate (lepiej notyfikować niż gubić alert)
      log.warn("notify.area_check_failed", { userId, event, err: String(err) });
    }
  }

  let prefs;
  try {
    prefs = await getUserPreferences(userId);
  } catch (err) {
    log.warn("notify.prefs_failed", { userId, err: String(err) });
    return;
  }

  const wantInApp = shouldNotify(prefs, event, "inApp");
  const wantEmail = ctx.forceEmail || shouldNotify(prefs, event, "email");
  const severity = ctx.severity ?? "info";

  // userVisible decyduje czy event trafia do mp_inbox (bell icon UI).
  // security.* eventy z userVisible:true (webauthn/totp configured/removed)
  // wpadają do inbox; te z userVisible:false (login.new_device, brute_force,
  // password.changed) tylko do mp_security_events i email.
  const userVisible = (def as { userVisible?: boolean }).userVisible !== false;

  if (wantInApp && userVisible) {
    try {
      await withClient((c) =>
        c.query(
          `INSERT INTO mp_inbox (user_id, event_key, title, body, severity, payload)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            userId,
            event,
            ctx.title,
            ctx.body,
            severity,
            ctx.payload ? JSON.stringify(ctx.payload) : null,
          ],
        ),
      );
    } catch (err) {
      log.warn("notify.inbox_insert_failed", { userId, event, err: String(err) });
    }
  }

  if (wantEmail) {
    const email = await getUserEmail(userId);
    if (email) {
      try {
        await sendMail({
          to: email,
          subject: ctx.title,
          html: renderEmail(ctx.title, ctx.body, severity),
          text: ctx.body,
        });
      } catch (err) {
        log.warn("notify.email_failed", { userId, event, err: String(err) });
      }
    }
  }
}

/**
 * Bulk notify — wysyła to samo zdarzenie do wielu userów (np. wszystkich
 * adminów `admin.backup.failed`). Każdy user ma własne prefs.
 */
export async function notifyUsers(
  userIds: string[],
  event: NotifEventKey,
  ctx: NotifyContext,
): Promise<void> {
  await Promise.allSettled(userIds.map((id) => notifyUser(id, event, ctx)));
}

/**
 * Lookup KC userId po email. Null gdy brak lub error.
 */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  if (!email) return null;
  try {
    const adminToken = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(
      `/users?email=${encodeURIComponent(email)}&exact=true`,
      adminToken,
    );
    if (!res.ok) return null;
    const users = (await res.json()) as Array<{ id?: string }>;
    return users[0]?.id ?? null;
  } catch (err) {
    log.warn("notify.email_lookup_failed", { email, err: String(err) });
    return null;
  }
}

/**
 * Wszystkie userIds którzy mają realm role `admin` (= mogą dostać
 * `admin.*` notifications). Odpytuje KC service account.
 */
export async function getAdminUserIds(): Promise<string[]> {
  try {
    const adminToken = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(
      `/roles/admin/users?max=200`,
      adminToken,
    );
    if (!res.ok) return [];
    const list = (await res.json()) as Array<{ id?: string }>;
    return list.map((u) => u.id).filter((id): id is string => !!id);
  } catch (err) {
    log.warn("notify.admin_lookup_failed", { err: String(err) });
    return [];
  }
}
