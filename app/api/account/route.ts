export const dynamic = "force-dynamic";

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

    const accessToken = (session as any).accessToken as string;

    // Try Keycloak Account API first for full profile with attributes
    const accountUrl = keycloak.getAccountUrl("/account");
    let response = await fetch(accountUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    let data: any;

    if (response.ok) {
      // Account API succeeded - use it
      data = await response.json();
    } else {
      const userInfoUrl = `${keycloak.getIssuer()}/protocol/openid-connect/userinfo`;
      response = await fetch(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError("SERVICE_UNAVAILABLE", "Failed to fetch profile", response.status, errorText);
      }

      data = await response.json();
    }

    const tokenPayload = keycloak.decodeTokenPayload(accessToken);

    // Extract phone number from attributes if available (Account API) or token (userinfo)
    const phoneNumber = data.attributes?.["phone-number"]?.[0] || 
                        data.attributes?.["phoneNumber"]?.[0] || 
                        tokenPayload.phone_number ||
                        data.phoneNumber || 
                        "";

    // Fetch required actions via Admin API if not available
    let requiredActions = data.requiredActions || [];
    if (!requiredActions || requiredActions.length === 0) {
      try {
        const userId = await keycloak.getUserIdFromToken(accessToken);
        const adminToken = await keycloak.getServiceAccountToken();
        const userResponse = await fetch(keycloak.getAdminUrl(`/users/${userId}`), {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            Accept: "application/json",
          },
        });
        if (userResponse.ok) {
          const userData = await userResponse.json();
          requiredActions = userData.requiredActions || [];
        }
      } catch (e) {
        console.warn("[account GET] Failed to fetch required actions:", e);
      }
    }

    const mergedData = {
      id: data.id || tokenPayload.sub,
      username: data.username || data.preferred_username || tokenPayload.preferred_username,
      firstName: data.firstName || data.first_name || data.given_name || tokenPayload.given_name,
      lastName: data.lastName || data.last_name || data.family_name || tokenPayload.family_name,
      email: data.email || tokenPayload.email,
      emailVerified: data.emailVerified || data.email_verified || tokenPayload.email_verified,
      attributes: {
        "phone-number": phoneNumber ? [phoneNumber] : [],
        ...(data.attributes || {}),
      },
      requiredActions: requiredActions,
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

    const userId = await keycloak.getUserIdFromToken(accessToken);
    const adminToken = await keycloak.getServiceAccountToken();

    // Fetch current user data via Admin API
    const userRes = await fetch(keycloak.getAdminUrl(`/users/${userId}`), {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Accept: "application/json",
      },
    });

    if (!userRes.ok) {
      const errorText = await userRes.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to fetch current user",
        userRes.status,
        errorText
      );
    }

    const currentUser = await userRes.json();
    const isEmailChanged = email && email !== currentUser.email;

    const updateBody: Record<string, any> = {};
    if (firstName !== undefined) updateBody.firstName = firstName;
    if (lastName !== undefined) updateBody.lastName = lastName;
    if (email !== undefined) updateBody.email = email;

    // Merge attributes
    updateBody.attributes = {
      ...(currentUser.attributes || {}),
      ...(attributes || {}),
    };

    const updateRes = await fetch(keycloak.getAdminUrl(`/users/${userId}`), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateBody),
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
