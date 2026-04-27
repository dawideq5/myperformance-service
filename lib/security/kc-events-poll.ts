import { keycloak } from "@/lib/keycloak";
import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { recordEvent } from "@/lib/security/db";
import { checkBruteForce } from "@/lib/security/brute-force";
import type { NotifEventKey } from "@/lib/preferences";

const logger = log.child({ module: "kc-events-poll" });

/**
 * Backup mechanism dla KC eventów — phasetwo webhook delivery worker
 * był niesprawny w produkcji (storeWebhookEvents=true zapisuje do DB
 * ale send worker nie startuje). Ten polling czyta event_entity przez
 * KC Admin API co N sekund i dispatchuje przez notify pipeline.
 *
 * State: ostatni przetworzony timestamp w `mp_kc_event_cursor`
 * (singleton, jedna kolumna).
 */

interface KcEvent {
  id?: string;
  time?: number;
  type?: string;
  realmId?: string;
  clientId?: string;
  userId?: string;
  ipAddress?: string;
  error?: string;
  details?: Record<string, string | undefined>;
}

async function ensureCursorTable(): Promise<void> {
  await withClient((c) =>
    c.query(`
      CREATE TABLE IF NOT EXISTS mp_kc_event_cursor (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        last_event_time BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      INSERT INTO mp_kc_event_cursor (id, last_event_time)
      VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
      ALTER TABLE mp_kc_event_cursor
        ADD COLUMN IF NOT EXISTS last_admin_event_time BIGINT NOT NULL DEFAULT 0;
    `),
  );
}

async function getCursor(): Promise<number> {
  await ensureCursorTable();
  return withClient(async (c) => {
    const r = await c.query<{ last_event_time: string }>(
      `SELECT last_event_time::text FROM mp_kc_event_cursor WHERE id = 1`,
    );
    return Number(r.rows[0]?.last_event_time ?? "0");
  });
}

async function setCursor(ts: number): Promise<void> {
  await withClient((c) =>
    c.query(
      `UPDATE mp_kc_event_cursor SET last_event_time = $1, updated_at = now() WHERE id = 1`,
      [ts],
    ),
  );
}

async function getAdminCursor(): Promise<number> {
  await ensureCursorTable();
  return withClient(async (c) => {
    const r = await c.query<{ last_admin_event_time: string }>(
      `SELECT last_admin_event_time::text FROM mp_kc_event_cursor WHERE id = 1`,
    );
    return Number(r.rows[0]?.last_admin_event_time ?? "0");
  });
}

async function setAdminCursor(ts: number): Promise<void> {
  await withClient((c) =>
    c.query(
      `UPDATE mp_kc_event_cursor SET last_admin_event_time = $1, updated_at = now() WHERE id = 1`,
      [ts],
    ),
  );
}

async function dispatch(event: KcEvent): Promise<void> {
  const type = event.type ?? "";
  const userId = event.userId;
  const email = event.details?.username;
  const ip = event.ipAddress;

  // Każdy event dostaje wpis w mp_security_events (audit-trail), niezależnie
  // od typu. recordEvent dodatkowo wystrzeliwuje admin.security.event.high
  // dla severity=high|critical.
  if (type) {
    const sev =
      type.endsWith("_ERROR") || type === "LOGIN_ERROR" ? "medium" : "info";
    await recordEvent({
      severity: sev,
      category: `keycloak.${type.toLowerCase()}`,
      source: "kc-events-poll",
      title: `Keycloak: ${type}`,
      description: event.error ?? undefined,
      srcIp: ip,
      targetUser: email ?? undefined,
      details: {
        eventType: type,
        clientId: event.clientId,
        userId,
      },
    }).catch(() => undefined);
  }

  // LOGIN_ERROR → security.login.failed + brute-force check
  if (type === "LOGIN_ERROR") {
    if (ip) {
      void checkBruteForce({ srcIp: ip, targetUser: email }).catch(() => undefined);
    }
    if (email) {
      const uid = await getUserIdByEmail(email);
      if (uid) {
        await notifyUser(uid, "security.login.failed", {
          title: "Nieudana próba logowania",
          body: `Z IP ${ip ?? "?"} próbowano zalogować się na Twoje konto. Jeśli to nie Ty — zmień hasło i włącz 2FA.`,
          severity: "warning",
          payload: { ip, error: event.error, clientId: event.clientId },
        });
      }
    }
    return;
  }

  // UPDATE_PASSWORD → security.password.changed (forceEmail)
  if (type === "UPDATE_PASSWORD" && userId) {
    await notifyUser(userId, "security.password.changed", {
      title: "Zmieniono hasło na Twoim koncie",
      body: `Hasło zostało zmienione ${new Date().toLocaleString("pl-PL")}${ip ? `, z IP ${ip}` : ""}. Jeśli to nie Ty — natychmiast skontaktuj się z administratorem i włącz 2FA.`,
      severity: "warning",
      payload: { ip },
      forceEmail: true,
    });
    return;
  }

  // SEND_RESET_PASSWORD / EXECUTE_ACTIONS — info-only event, nie generujemy
  // powiadomienia (user sam triggerował akcję, niepotrzebny szum).

  // REMOVE_TOTP / UPDATE_TOTP → security.totp.removed / .configured
  if (type === "UPDATE_TOTP" && userId) {
    await notifyUser(userId, "security.totp.configured", {
      title: "Skonfigurowano aplikację 2FA",
      body: `Aplikacja TOTP została skonfigurowana ${new Date().toLocaleString("pl-PL")}${ip ? `, z IP ${ip}` : ""}. Jeśli to nie Ty — natychmiast skontaktuj się z administratorem.`,
      severity: "success",
      payload: { ip },
      forceEmail: true,
    });
    return;
  }
  if (type === "REMOVE_TOTP" && userId) {
    await notifyUser(userId, "security.totp.removed", {
      title: "Usunięto aplikację 2FA",
      body: `Aplikacja TOTP została usunięta z konta ${new Date().toLocaleString("pl-PL")}${ip ? `, z IP ${ip}` : ""}. Jeśli to nie Ty — natychmiast skontaktuj się z administratorem.`,
      severity: "warning",
      payload: { ip },
      forceEmail: true,
    });
    return;
  }

  // UPDATE_CREDENTIAL z type=webauthn / webauthn-passwordless
  // → security.webauthn.configured. KC poll catch-uje przez generic event.
  if (
    (type === "UPDATE_CREDENTIAL" || type === "REGISTER") &&
    userId &&
    /webauthn/i.test(JSON.stringify(event.details ?? {}))
  ) {
    await notifyUser(userId, "security.webauthn.configured", {
      title: "Zarejestrowano klucz bezpieczeństwa",
      body: `Klucz bezpieczeństwa / passkey został zarejestrowany ${new Date().toLocaleString("pl-PL")}${ip ? `, z IP ${ip}` : ""}. Jeśli to nie Ty — natychmiast skontaktuj się z administratorem.`,
      severity: "success",
      payload: { ip },
      forceEmail: true,
    });
    return;
  }
  if (type === "REMOVE_CREDENTIAL" && userId) {
    await notifyUser(userId, "security.webauthn.removed", {
      title: "Usunięto klucz bezpieczeństwa",
      body: `Klucz bezpieczeństwa / passkey został usunięty ${new Date().toLocaleString("pl-PL")}${ip ? `, z IP ${ip}` : ""}. Jeśli to nie Ty — natychmiast skontaktuj się z administratorem.`,
      severity: "warning",
      payload: { ip },
      forceEmail: true,
    });
    return;
  }
}

/**
 * Fetch nowych KC events od ostatniego cursora i dispatch przez notify
 * pipeline. Best-effort — failures są logowane, nie throwowane.
 *
 * Zwraca liczbę przetworzonych eventów.
 */
export async function pollKcEvents(opts: { realm?: string; max?: number } = {}): Promise<{
  processed: number;
  errors: number;
}> {
  const realm = opts.realm ?? "MyPerformance";
  const max = opts.max ?? 100;

  let cursor: number;
  try {
    cursor = await getCursor();
  } catch (err) {
    logger.warn("cursor fetch failed", { err: String(err) });
    return { processed: 0, errors: 1 };
  }

  let token: string;
  try {
    token = await keycloak.getServiceAccountToken();
  } catch (err) {
    logger.warn("KC token fetch failed", { err: String(err) });
    return { processed: 0, errors: 1 };
  }

  const types = [
    "LOGIN_ERROR",
    "UPDATE_PASSWORD",
    "REMOVE_TOTP",
    "UPDATE_TOTP",
    "UPDATE_CREDENTIAL",
    "REMOVE_CREDENTIAL",
    "SEND_RESET_PASSWORD",
    "EXECUTE_ACTIONS",
    "VERIFY_EMAIL",
    "REGISTER",
  ];
  const typeQs = types.map((t) => `type=${encodeURIComponent(t)}`).join("&");
  const path = `/events?max=${max}&${typeQs}`;

  let events: KcEvent[];
  try {
    const res = await keycloak.adminRequest(path, token);
    if (!res.ok) {
      logger.warn("KC events API failed", { status: res.status });
      return { processed: 0, errors: 1 };
    }
    events = (await res.json()) as KcEvent[];
  } catch (err) {
    logger.warn("KC events fetch failed", { err: String(err) });
    return { processed: 0, errors: 1 };
  }

  // KC zwraca eventy DESC (najnowsze pierwsze). Filtrujemy po time > cursor
  // i przetwarzamy ASC (najstarsze pierwsze) żeby cursor szedł monotonicznie.
  const fresh = events
    .filter((e) => typeof e.time === "number" && e.time > cursor)
    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

  let processed = 0;
  let errors = 0;
  let newCursor = cursor;

  for (const e of fresh) {
    try {
      await dispatch(e);
      processed++;
      if ((e.time ?? 0) > newCursor) newCursor = e.time ?? 0;
    } catch (err) {
      errors++;
      logger.warn("dispatch failed", {
        type: e.type,
        err: String(err),
      });
    }
  }

  if (newCursor > cursor) {
    await setCursor(newCursor).catch((err) => {
      logger.warn("cursor save failed", { err: String(err) });
    });
  }

  // Polowanie admin-events. KC w 26.x emituje user-event REMOVE_TOTP gdy
  // user usuwa TOTP, ale dla webauthn delete emituje TYLKO admin-event
  // (operationType=ACTION na users/{id}/credentials/{credId}). Bez tego
  // user nie dostawał notyfikacji o usunięciu klucza/passkey.
  try {
    const adminProcessed = await pollAdminEvents(token, max);
    processed += adminProcessed;
  } catch (err) {
    errors++;
    logger.warn("admin events poll failed", { err: String(err) });
  }

  if (processed > 0 || errors > 0) {
    logger.info("kc-events-poll cycle", { processed, errors, cursor: newCursor });
  }
  return { processed, errors };
}

interface KcAdminEvent {
  id?: string;
  time?: number;
  operationType?: string;
  resourceType?: string;
  resourcePath?: string;
  authDetails?: { ipAddress?: string };
}

async function pollAdminEvents(token: string, max: number): Promise<number> {
  const cursor = await getAdminCursor();
  const path = `/admin-events?max=${max}&operationTypes=ACTION&resourceTypes=USER`;
  let events: KcAdminEvent[];
  try {
    const res = await keycloak.adminRequest(path, token);
    if (!res.ok) {
      logger.warn("admin-events API failed", { status: res.status });
      return 0;
    }
    events = (await res.json()) as KcAdminEvent[];
  } catch (err) {
    logger.warn("admin-events fetch failed", { err: String(err) });
    return 0;
  }

  // Filtrujemy tylko events na credentials (path /credentials/...)
  const fresh = events
    .filter(
      (e) =>
        typeof e.time === "number" &&
        e.time > cursor &&
        /\/credentials\/[a-z0-9-]+/i.test(e.resourcePath ?? ""),
    )
    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

  let processed = 0;
  let newCursor = cursor;
  for (const ev of fresh) {
    try {
      // Wyciągamy targetUserId z resource path: users/{id}/credentials/{credId}
      const m = (ev.resourcePath ?? "").match(/users\/([a-f0-9-]+)\/credentials\//i);
      const targetUserId = m?.[1];
      if (!targetUserId) continue;
      const ip = ev.authDetails?.ipAddress;
      // KC ACTION na credential = user usunął credential (KC 26.x nie
      // emituje user-event REMOVE_CREDENTIAL przez Account Console). Nie
      // wiemy z resource path czy to webauthn czy totp — emitujemy generyczne
      // security.webauthn.removed (najczęstszy przypadek; user prefer
      // notyfikację over silent miss).
      await notifyUser(targetUserId, "security.webauthn.removed", {
        title: "Usunięto klucz / metodę uwierzytelnienia",
        body: `Credential bezpieczeństwa (klucz / 2FA) został usunięty z Twojego konta ${new Date().toLocaleString("pl-PL")}${ip ? `, z IP ${ip}` : ""}. Jeśli to nie Ty — natychmiast skontaktuj się z administratorem.`,
        severity: "warning",
        payload: { ip, source: "admin-event-poll" },
        forceEmail: true,
      });
      processed++;
      if ((ev.time ?? 0) > newCursor) newCursor = ev.time ?? 0;
    } catch (err) {
      logger.warn("admin-event dispatch failed", {
        err: String(err),
        path: ev.resourcePath,
      });
    }
  }

  if (newCursor > cursor) {
    await setAdminCursor(newCursor).catch((err) => {
      logger.warn("admin cursor save failed", { err: String(err) });
    });
  }
  return processed;
}
