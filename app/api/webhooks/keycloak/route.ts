import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";

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
 * Handles:
 *   - VERIFY_EMAIL / VERIFY_EMAIL_ERROR → strip VERIFY_EMAIL required action
 *   - UPDATE_EMAIL → reset emailVerified flag
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
  details?: Record<string, unknown>;
  time?: number;
}

function authorize(request: NextRequest): "ok" | "missing-secret" | "unauthorized" {
  const secret = process.env.KEYCLOAK_WEBHOOK_SECRET?.trim();
  if (!secret) return "missing-secret";

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header, "utf-8");
  const expectedBuf = Buffer.from(expected, "utf-8");
  if (headerBuf.length !== expectedBuf.length) return "unauthorized";
  return timingSafeEqual(headerBuf, expectedBuf) ? "ok" : "unauthorized";
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
  const authResult = authorize(request);
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
    event = (await request.json()) as KeycloakEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info("received event", {
    type: event.type,
    realmId: event.realmId,
    userId: event.userId,
    time: event.time,
  });

  if (!event.userId) {
    return NextResponse.json({ ok: true, skipped: "no-user" });
  }

  switch (event.type) {
    case "VERIFY_EMAIL":
    case "VERIFY_EMAIL_ERROR":
      await handleVerifyEmailEvent(event.userId);
      break;
    case "UPDATE_EMAIL":
      await handleUpdateEmailEvent(event.userId);
      break;
    case "REGISTER":
      logger.info("new user registered", { userId: event.userId });
      break;
    default:
      logger.debug("unhandled event type", { type: event.type });
  }

  return NextResponse.json({ ok: true });
}

/** Liveness probe for the webhook endpoint itself. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    webhook: "keycloak-events",
    timestamp: new Date().toISOString(),
  });
}
