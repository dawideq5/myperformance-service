import { getServerSession } from "next-auth/next";
import { NextRequest } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

const ALLOWED_ACTIONS = [
  "CONFIGURE_TOTP",
  "WEBAUTHN_REGISTER",
  "VERIFY_EMAIL",
  "UPDATE_PASSWORD",
  "UPDATE_PROFILE",
];

/**
 * POST /api/account/required-actions
 *
 * Sets a required action for the current user.
 * For VERIFY_EMAIL, sends an immediate verification email.
 * For other actions, attaches them to the user record for next-login enforcement.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      throw ApiError.unauthorized();
    }

    const body = await request.json();
    const { action } = body;

    if (!action || typeof action !== "string") {
      throw ApiError.badRequest("Missing or invalid 'action' field");
    }

    if (!ALLOWED_ACTIONS.includes(action)) {
      throw ApiError.badRequest(
        `Invalid action. Allowed: ${ALLOWED_ACTIONS.join(", ")}`
      );
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    const requiredActionAlias = await keycloak.resolveRequiredActionAlias(
      serviceToken,
      keycloak.getRequiredActionAliases(action)
    );

    if (!requiredActionAlias) {
      throw ApiError.badRequest(
        "Required action not found in Keycloak configuration",
        `Action: ${action}`
      );
    }

    // For VERIFY_EMAIL, trigger an immediate action email
    if (
      keycloak.canonicalizeRequiredAction(requiredActionAlias) === "VERIFY_EMAIL"
    ) {
      await keycloak.executeActionsEmail(
        serviceToken,
        userId,
        [requiredActionAlias],
        {
          lifespan: 43200, // 12h
          clientId: process.env.KEYCLOAK_CLIENT_ID?.trim(),
          redirectUri:
            (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000") +
            "/api/auth/callback/keycloak",
        }
      );

      return createSuccessResponse({
        message: "Verification email has been sent",
        action: requiredActionAlias,
        requestedAction: action,
        immediate: true,
      });
    }

    await keycloak.appendUserRequiredAction(serviceToken, userId, requiredActionAlias);

    return createSuccessResponse({
      message: "Configuration will be required at next login",
      action: requiredActionAlias,
      requestedAction: action,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/account/required-actions?action={action}
 *
 * Removes a required action from the current user.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      throw ApiError.unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (!action) {
      throw ApiError.badRequest("Missing 'action' query parameter");
    }

    if (!ALLOWED_ACTIONS.includes(action)) {
      throw ApiError.badRequest(
        `Invalid action. Allowed: ${ALLOWED_ACTIONS.join(", ")}`
      );
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    const requiredActionAlias = await keycloak.resolveRequiredActionAlias(
      serviceToken,
      keycloak.getRequiredActionAliases(action)
    );

    if (!requiredActionAlias) {
      throw ApiError.badRequest(
        "Required action not found in Keycloak configuration",
        `Action: ${action}`
      );
    }

    await keycloak.removeUserRequiredAction(serviceToken, userId, requiredActionAlias);

    return createSuccessResponse({
      action: requiredActionAlias,
      requestedAction: action,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
