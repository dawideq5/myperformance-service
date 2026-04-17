import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  handleApiError,
  createSuccessResponse,
  requireSession,
} from "@/lib/api-utils";
import { withAdminContext } from "@/lib/keycloak-admin";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const userInfoUrl = `${keycloak.getIssuer()}/protocol/openid-connect/userinfo`;
    const response = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${(session as any).accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError("SERVICE_UNAVAILABLE", "Failed to fetch profile", response.status, errorText);
    }

    const data = await response.json();
    const tokenPayload = keycloak.decodeTokenPayload((session as any).accessToken);

    const mergedData = {
      ...data,
      username: tokenPayload.preferred_username || data.preferred_username,
      firstName: tokenPayload.given_name || data.given_name,
      lastName: tokenPayload.family_name || data.family_name,
      emailVerified: tokenPayload.email_verified || data.email_verified,
      attributes: {
        "phone-number": tokenPayload.phone_number ? [tokenPayload.phone_number] : [],
      },
      requiredActions: [],
    };

    return createSuccessResponse(mergedData);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const accessToken = (session as any).accessToken as string;
    const body = await request.json();
    const { firstName, lastName, email, attributes } = body;

    const currentProfileRes = await fetch(keycloak.getAccountUrl("/account"), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!currentProfileRes.ok) {
      const errorText = await currentProfileRes.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to fetch current profile",
        currentProfileRes.status,
        errorText
      );
    }

    const currentProfile = await currentProfileRes.json();
    const isEmailChanged = email && email !== currentProfile.email;

    const accountUpdateBody: Record<string, any> = {};
    if (firstName !== undefined) accountUpdateBody.firstName = firstName;
    if (lastName !== undefined) accountUpdateBody.lastName = lastName;
    if (email !== undefined) accountUpdateBody.email = email;

    accountUpdateBody.attributes = {
      ...(currentProfile.attributes || {}),
      ...(attributes || {}),
    };

    const updateRes = await fetch(keycloak.getAccountUrl("/account"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(accountUpdateBody),
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      throw new ApiError(
        "BAD_REQUEST",
        "Failed to update profile",
        updateRes.status,
        errorText
      );
    }

    let googleDisconnected = false;
    if (isEmailChanged) {
      try {
        await withAdminContext(accessToken, async (adminToken, userId) => {
          await keycloak.removeFederatedIdentity(adminToken, userId, "google");
          await keycloak.updateUserAttributes(adminToken, userId, {
            google_features_requested: [],
          });
          return null;
        });
        googleDisconnected = true;
      } catch (disconnectErr) {
        console.error(
          "[API /account PUT] Failed to disconnect Google after email change:",
          disconnectErr
        );
      }
    }

    return createSuccessResponse({ googleDisconnected });
  } catch (error) {
    return handleApiError(error);
  }
}
