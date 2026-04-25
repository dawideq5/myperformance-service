import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";
import {
  enqueueProfilePropagation,
  enqueueUserDeprovision,
} from "@/lib/permissions/sync";
import { appendIamAudit } from "@/lib/permissions/db";
import { recordEvent as recordSecurityEvent } from "@/lib/security/db";
import { checkBruteForce } from "@/lib/security/brute-force";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keycloak event receiver.
 *
 * Fail-closed: if KEYCLOAK_WEBHOOK_SECRET is unset, POST returns 503.
 * Anonymous webhook POSTs used to be allowed under "no secret configured"
 * which meant a misdeployment silently opened an unauthenticated admin
 * action channel.
 *
 * Auth (przyjmuje obie metody):
 *   - Bearer:  Authorization: Bearer <KEYCLOAK_WEBHOOK_SECRET>
 *   - HMAC:    X-Keycloak-Signature: sha256=<hex(HMAC-SHA256(body, secret))>
 *              (format używany przez phasetwo keycloak-events SPI)
 *
 * Handles:
 *   - VERIFY_EMAIL / VERIFY_EMAIL_ERROR → strip VERIFY_EMAIL required action
 *   - UPDATE_EMAIL / admin.UPDATE_EMAIL → reset emailVerified + propagate profile
 *   - DELETE_USER  / admin.DELETE_USER  → cascading delete via enqueueUserDeprovision
 *   - REGISTER → log only (hook for welcome flow)
 */

const logger = log.child({ module: "webhook/keycloak" });

interface KeycloakEvent {
  type: string;
  realmId: string;
  clientId?: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  resourceType?: string;
  resourcePath?: string;
  representation?: string; // phasetwo wysyła stringified JSON gdy includeRepresentation=true
  details?: Record<string, unknown> & {
    email?: string;
    username?: string;
    previous_email?: string;
    updated_email?: string;
    userId?: string;
  };
  time?: number;
}

/**
 * Phasetwo dla `admin.USER-CREATE` wysyła `representation` jako stringified
 * JSON user-a. Próbujemy go sparse'ować i pobrać email + userId, żeby przy
 * następnym DELETE móc cascadą usunąć z natywnych apek.
 */
function extractEmailFromRepresentation(repr?: string): string | null {
  if (!repr) return null;
  try {
    const obj = JSON.parse(repr) as { email?: string };
    return obj.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Z resourcePath wyciągamy userId. Phasetwo path = "users/<uuid>".
 */
function extractUserIdFromPath(path?: string): string | null {
  if (!path) return null;
  const m = path.match(/^users\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf-8");
  const bBuf = Buffer.from(b, "utf-8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function authorize(
  request: NextRequest,
  rawBody: string,
): "ok" | "missing-secret" | "unauthorized" {
  const secret = process.env.KEYCLOAK_WEBHOOK_SECRET?.trim();
  if (!secret) return "missing-secret";

  // Method 1: Authorization: Bearer <secret> (legacy / simple SPI).
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    if (safeEqualString(authHeader, `Bearer ${secret}`)) return "ok";
  }

  // Method 2: HMAC-SHA256 signature. Phasetwo keycloak-events SPI używa
  // headera `X-Keycloak-Signature` z hex HMAC. Akceptujemy też prefiks
  // `sha256=` (GitHub-style) i alternatywne nagłówki dla kompatybilności.
  const sigHeaderRaw =
    request.headers.get("x-keycloak-signature") ??
    request.headers.get("x-keycloak-webhook-signature") ??
    request.headers.get("x-hub-signature-256") ??
    "";
  if (sigHeaderRaw) {
    const sig = sigHeaderRaw.replace(/^sha256=/, "").trim();
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (safeEqualHex(sig, expected)) return "ok";
    // Debug: logujemy długość + pierwsze znaki żeby diagnozować rozjazd.
    logger.warn("HMAC mismatch", {
      headerName: request.headers.get("x-keycloak-signature")
        ? "x-keycloak-signature"
        : request.headers.get("x-keycloak-webhook-signature")
          ? "x-keycloak-webhook-signature"
          : "x-hub-signature-256",
      headerLen: sig.length,
      headerPrefix: sig.slice(0, 8),
      expectedPrefix: expected.slice(0, 8),
      bodyLen: rawBody.length,
    });
  } else {
    logger.warn("no signature header on webhook", {
      headers: Array.from(request.headers.keys()).slice(0, 20),
    });
  }

  return "unauthorized";
}

async function handleVerifyEmailEvent(userId: string): Promise<void> {
  try {
    const serviceToken = await keycloak.getServiceAccountToken();
    const userResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
    if (!userResponse.ok) {
      logger.error("failed to fetch user", {
        userId,
        status: userResponse.status,
        detail: await userResponse.text().catch(() => ""),
      });
      return;
    }

    const userData = await userResponse.json();
    if (userData.emailVerified !== true) return;

    const requiredActions = (userData.requiredActions || []).filter(
      (action: string) => keycloak.canonicalizeRequiredAction(action) !== "VERIFY_EMAIL",
    );

    const updateResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken, {
      method: "PUT",
      body: JSON.stringify({ ...userData, requiredActions }),
    });

    if (updateResponse.ok) {
      logger.info("cleared VERIFY_EMAIL required action", { userId });
    } else {
      logger.error("failed to update user", {
        userId,
        status: updateResponse.status,
        detail: await updateResponse.text().catch(() => ""),
      });
    }
  } catch (err) {
    logger.error("handleVerifyEmailEvent failed", { userId, err });
  }
}

async function handleUpdateEmailEvent(userId: string): Promise<void> {
  try {
    const serviceToken = await keycloak.getServiceAccountToken();
    const userResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
    if (!userResponse.ok) return;

    const userData = await userResponse.json();
    if (!userData.emailVerified) return;

    await keycloak.adminRequest(`/users/${userId}`, serviceToken, {
      method: "PUT",
      body: JSON.stringify({ ...userData, emailVerified: false }),
    });
    logger.info("reset email verification after UPDATE_EMAIL", { userId });
  } catch (err) {
    logger.error("handleUpdateEmailEvent failed", { userId, err });
  }
}

export async function POST(request: NextRequest) {
  // Important: read body as text once — we need raw bytes for HMAC verify
  // AND parsed JSON for routing. JSON.parse is cheap, so parse after auth.
  const rawBody = await request.text();
  const authResult = authorize(request, rawBody);
  if (authResult === "missing-secret") {
    logger.error("KEYCLOAK_WEBHOOK_SECRET not configured — refusing webhook");
    return NextResponse.json({ error: "Webhook disabled" }, { status: 503 });
  }
  if (authResult === "unauthorized") {
    logger.warn("unauthorized webhook request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: KeycloakEvent;
  try {
    event = JSON.parse(rawBody) as KeycloakEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info("received event", {
    type: event.type,
    realmId: event.realmId,
    userId: event.userId,
    time: event.time,
  });

  // Resolve userId — phasetwo wysyła event.userId dla auth events ale dla
  // admin events musimy parsować resourcePath ("users/<uuid>").
  const resolvedUserId =
    event.userId ?? extractUserIdFromPath(event.resourcePath) ?? null;

  // Email cache — przy CREATE/UPDATE phasetwo wysyła `representation`
  // (gdy includeRepresentation=true). Wyciągamy email i zapisujemy w
  // iam_audit_log z details.email — przy DELETE odczytamy najnowszy.
  const reprEmail = extractEmailFromRepresentation(event.representation);

  // Audyt każdego webhooka — niezależnie od typu — daje admin pełną
  // historię tego co KC zgłasza do dashboardu + email cache.
  await appendIamAudit({
    actor: `kc-webhook:${event.realmId ?? "?"}`,
    operation: "user.deprovision",
    targetType: "user",
    targetId: resolvedUserId ?? event.details?.email ?? "?",
    status: "ok",
    details: {
      kind: "webhook.received",
      eventType: event.type,
      ip: event.ipAddress,
      email: reprEmail ?? event.details?.email ?? null,
    },
  }).catch(() => undefined);

  // Normalize event type. Phasetwo używa formatu "admin.USER-DELETE",
  // built-in jboss-logging "DELETE_USER", access events typu "UPDATE_EMAIL".
  // Zamieniamy myślniki na podkreślenia + reorder dla admin events:
  //   "admin.USER-DELETE" → "DELETE_USER"
  //   "admin.USER-UPDATE" → "UPDATE_USER"
  //   "access.UPDATE_EMAIL" / "UPDATE_EMAIL" → "UPDATE_EMAIL"
  let normalizedType = event.type ?? "";
  const adminMatch = normalizedType.match(/^admin\.(\w+)-(\w+)$/);
  if (adminMatch) {
    normalizedType = `${adminMatch[2]}_${adminMatch[1]}`; // DELETE_USER, UPDATE_USER, CREATE_USER
  } else {
    normalizedType = normalizedType.replace(/^(admin\.|access\.)/, "");
  }

  // ── Record security event (best-effort, nie blokuje główny flow) ─────
  void recordSecurityEvent({
    severity:
      normalizedType === "DELETE_USER"
        ? "high"
        : normalizedType.includes("ERROR") || normalizedType === "LOGIN_ERROR"
          ? "medium"
          : "info",
    category: `keycloak.${normalizedType.toLowerCase()}`,
    source: "keycloak-webhook",
    title: `Keycloak: ${normalizedType}`,
    description: `Realm event z Keycloak — ${event.type}`,
    srcIp: event.ipAddress,
    targetUser: event.details?.email ?? event.details?.username,
    details: {
      eventType: event.type,
      realmId: event.realmId,
      userId: resolvedUserId,
    },
  }).catch(() => undefined);

  // ── Brute force detection ──────────────────────────────────────────────
  // Po LOGIN_ERROR sprawdź czy threshold (5+ w 5 min). Auto-block + alert.
  if (normalizedType === "LOGIN_ERROR" && event.ipAddress) {
    void checkBruteForce({
      srcIp: event.ipAddress,
      targetUser: event.details?.username ?? event.details?.email,
    }).catch(() => undefined);
  }

  // ── Cascading delete ────────────────────────────────────────────────────
  if (normalizedType === "DELETE_USER") {
    let email =
      event.details?.email ??
      event.details?.username ??
      reprEmail ??
      undefined;
    // Fallback 1: pobierz z KC Admin API (działa tylko przed faktycznym
    // delete — dla DELETE event user już nie istnieje, więc 404).
    if (!email && resolvedUserId) {
      email = (await resolveEmailFromUserId(resolvedUserId)) ?? undefined;
    }
    // Fallback 2: lookup w iam_audit_log po wcześniejszych webhook event
    // które miały representation (USER-CREATE / USER-UPDATE).
    if (!email && resolvedUserId) {
      email = (await lookupEmailFromAuditCache(resolvedUserId)) ?? undefined;
    }
    if (!email) {
      logger.warn("DELETE_USER without resolvable email — skipping", {
        userId: resolvedUserId,
      });
      return NextResponse.json({ accepted: false, reason: "no email" });
    }
    await enqueueUserDeprovision({
      email,
      actor: "kc-webhook:DELETE_USER",
    });
    logger.info("enqueued user deprovision via webhook", {
      email,
      userId: resolvedUserId,
    });
    return NextResponse.json({ accepted: true, action: "deprovision", email });
  }

  if (!event.userId) {
    return NextResponse.json({ ok: true, skipped: "no-user" });
  }

  switch (normalizedType) {
    case "VERIFY_EMAIL":
    case "VERIFY_EMAIL_ERROR":
      await handleVerifyEmailEvent(event.userId);
      break;
    case "UPDATE_EMAIL":
      await handleUpdateEmailEvent(event.userId);
      // Profile propagation w tle — apki dostają nowy email.
      await enqueueProfilePropagation(event.userId, {
        previousEmail: event.details?.previous_email,
        actor: "kc-webhook:UPDATE_EMAIL",
      }).catch((err) => {
        logger.warn("profile propagation enqueue failed", { err });
      });
      break;
    case "UPDATE_USER":
      // KC wysyła UPDATE_USER przy zmianie firstName/lastName/attributes —
      // propagate do natywnych apek żeby imię/nazwisko były świeże wszędzie.
      await enqueueProfilePropagation(event.userId, {
        actor: "kc-webhook:UPDATE_USER",
      }).catch((err) => {
        logger.warn("profile propagation enqueue failed", { err });
      });
      break;
    case "REGISTER":
      logger.info("new user registered", { userId: event.userId });
      break;
    default:
      logger.debug("unhandled event type", { type: event.type });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Cache lookup: szukamy najnowszego webhook.received auditu z details.email
 * dla danego userId. Pozwala odzyskać email user-a po DELETE — phasetwo
 * dla USER-CREATE/USER-UPDATE wysyła representation którego email zapisujemy
 * przy każdym webhooku.
 */
async function lookupEmailFromAuditCache(
  userId: string,
): Promise<string | null> {
  try {
    const { withIamClient } = await import("@/lib/permissions/db");
    return await withIamClient(async (c) => {
      const res = await c.query<{ details: { email?: string | null } }>(
        `SELECT details
           FROM iam_audit_log
          WHERE target_type = 'user'
            AND target_id = $1
            AND details->>'email' IS NOT NULL
          ORDER BY ts DESC
          LIMIT 1`,
        [userId],
      );
      return res.rows[0]?.details?.email ?? null;
    });
  } catch {
    return null;
  }
}

async function resolveEmailFromUserId(userId: string): Promise<string | null> {
  // For DELETE_USER post-event the user is już usunięty z KC — Admin API
  // zwróci 404. Phasetwo SPI wkłada email w details, więc primary path =
  // event.details.email. Ten helper jest fallback dla starszych wersji SPI
  // i pre-events.
  try {
    const adminToken = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(`/users/${userId}`, adminToken);
    if (!res.ok) return null;
    const u = (await res.json()) as { email?: string };
    return u.email ?? null;
  } catch {
    return null;
  }
}

/** Liveness probe for the webhook endpoint itself. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    webhook: "keycloak-events",
    timestamp: new Date().toISOString(),
  });
}
