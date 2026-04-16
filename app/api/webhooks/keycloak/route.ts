import { NextRequest, NextResponse } from "next/server";
import { keycloak } from "@/lib/keycloak";

/**
 * Keycloak Events Webhook
 * Receives events from Keycloak and handles them appropriately
 * - VERIFY_EMAIL: Updates user email verification status
 */

// Webhook secret for authentication
const WEBHOOK_SECRET = process.env.KEYCLOAK_WEBHOOK_SECRET;

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

/**
 * Verify webhook request is from Keycloak
 */
function verifyWebhookAuth(request: NextRequest): boolean {
  // If no secret configured, allow (dev mode) or check other auth
  if (!WEBHOOK_SECRET) {
    console.warn("[Keycloak Webhook] No WEBHOOK_SECRET configured, skipping auth check");
    return true;
  }

  const authHeader = request.headers.get("authorization");
  const expectedAuth = `Bearer ${WEBHOOK_SECRET}`;

  return authHeader === expectedAuth;
}

/**
 * Handle VERIFY_EMAIL event - sync email verification status
 */
async function handleVerifyEmailEvent(userId: string): Promise<void> {
  try {
    const serviceToken = await keycloak.getServiceAccountToken();

    // Get current user data
    const userResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
    if (!userResponse.ok) {
      console.error(`[Keycloak Webhook] Failed to fetch user ${userId}:`, await userResponse.text());
      return;
    }

    const userData = await userResponse.json();

    // Check if email is verified in Keycloak
    const isEmailVerified = userData.emailVerified === true;

    if (isEmailVerified) {
      // Remove VERIFY_EMAIL from required actions if present
      const requiredActions = (userData.requiredActions || []).filter(
        (action: string) => keycloak.canonicalizeRequiredAction(action) !== "VERIFY_EMAIL"
      );

      // Update user with cleared required action
      const updateResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken, {
        method: "PUT",
        body: JSON.stringify({
          ...userData,
          requiredActions,
        }),
      });

      if (updateResponse.ok) {
        console.log(`[Keycloak Webhook] User ${userId} email verified, removed VERIFY_EMAIL required action`);
      } else {
        console.error(`[Keycloak Webhook] Failed to update user ${userId}:`, await updateResponse.text());
      }
    }
  } catch (error) {
    console.error("[Keycloak Webhook] Error handling VERIFY_EMAIL event:", error);
  }
}

/**
 * Handle UPDATE_EMAIL event - sync email changes
 */
async function handleUpdateEmailEvent(userId: string): Promise<void> {
  try {
    const serviceToken = await keycloak.getServiceAccountToken();

    // Get current user data
    const userResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
    if (!userResponse.ok) {
      console.error(`[Keycloak Webhook] Failed to fetch user ${userId}:`, await userResponse.text());
      return;
    }

    const userData = await userResponse.json();

    // If email changed, ensure emailVerified is false
    if (userData.emailVerified) {
      const updateResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken, {
        method: "PUT",
        body: JSON.stringify({
          ...userData,
          emailVerified: false,
        }),
      });

      if (updateResponse.ok) {
        console.log(`[Keycloak Webhook] User ${userId} email changed, reset verification status`);
      }
    }
  } catch (error) {
    console.error("[Keycloak Webhook] Error handling UPDATE_EMAIL event:", error);
  }
}

/**
 * POST handler for Keycloak events
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    if (!verifyWebhookAuth(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse event payload
    const event: KeycloakEvent = await request.json();

    console.log("[Keycloak Webhook] Received event:", {
      type: event.type,
      realmId: event.realmId,
      userId: event.userId,
      time: event.time,
    });

    // Handle specific event types
    if (event.userId) {
      switch (event.type) {
        case "VERIFY_EMAIL":
        case "VERIFY_EMAIL_ERROR":
          await handleVerifyEmailEvent(event.userId);
          break;

        case "UPDATE_EMAIL":
          await handleUpdateEmailEvent(event.userId);
          break;

        case "REGISTER":
          // New user registered - could trigger welcome email
          console.log(`[Keycloak Webhook] New user registered: ${event.userId}`);
          break;

        default:
          // Log other events for debugging
          console.log(`[Keycloak Webhook] Unhandled event type: ${event.type}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Keycloak Webhook] Error processing event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET handler for webhook health check
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    webhook: "keycloak-events",
    timestamp: new Date().toISOString(),
  });
}
