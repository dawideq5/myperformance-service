import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  validateRequestBody,
} from "@/lib/api-utils";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

interface PasswordChangeRequest extends Record<string, unknown> {
  currentPassword: string;
  newPassword: string;
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/account/password
 *
 * Changes user password with verification of current password.
 * Uses OAuth2 Resource Owner Password Credentials for verification
 * and Keycloak Admin API for password update.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      throw ApiError.unauthorized();
    }

    // Throttle password-change attempts: 5 per 10 minutes per user+ip. Protects
    // against brute-forcing `currentPassword` via the verify step below.
    const userSub = session.user?.id || session.user?.email || "anon";
    const ipKey = getClientIp(request);
    const rl = rateLimit(`pw:${userSub}:${ipKey}`, {
      capacity: 5,
      refillPerSec: 5 / (10 * 60),
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Zbyt wiele prób. Spróbuj ponownie później." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
          },
        },
      );
    }

    const body = await request.json();

    if (!validateRequestBody<PasswordChangeRequest>(body, ["currentPassword", "newPassword"])) {
      throw ApiError.badRequest("Brakuje wymaganych pól: currentPassword, newPassword");
    }

    const { currentPassword, newPassword } = body;

    // Validate password strength
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw ApiError.badRequest(
        `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`
      );
    }

    // Step 1: Verify current password via Resource Owner Password Credentials Grant
    const verifyResponse = await fetch(
      keycloak.getAccountUrl("/protocol/openid-connect/token"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "password",
          client_id: process.env.KEYCLOAK_CLIENT_ID?.trim() || "",
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET?.trim() || "",
          username: session.user?.email || "",
          password: currentPassword,
          scope: "openid",
        }),
      }
    );

    if (!verifyResponse.ok) {
      throw ApiError.unauthorized("Aktualne hasło jest nieprawidłowe");
    }

    // Step 2: Update password via Admin API (required for password changes)
    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    const passwordUrl = keycloak.getAdminUrl(`/users/${userId}/reset-password`);

    const passwordResponse = await fetch(passwordUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "password",
        value: newPassword,
        temporary: false,
      }),
    });

    if (!passwordResponse.ok) {
      const errorText = await passwordResponse.text();
      throw new ApiError(
        "INTERNAL_ERROR",
        "Nie udało się zmienić hasła",
        passwordResponse.status,
        process.env.NODE_ENV === "development" ? errorText : undefined
      );
    }

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
