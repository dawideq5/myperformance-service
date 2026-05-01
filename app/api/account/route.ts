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
import { enqueueProfilePropagation } from "@/lib/permissions/sync";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const accessToken = session.accessToken ?? "";

    // Try Keycloak Account API first for full profile with attributes
    const accountUrl = keycloak.getAccountUrl("/account");
    let response = await fetch(accountUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    interface AccountProfile {
      id?: string;
      username?: string;
      preferred_username?: string;
      firstName?: string;
      first_name?: string;
      given_name?: string;
      lastName?: string;
      last_name?: string;
      family_name?: string;
      email?: string;
      emailVerified?: boolean;
      email_verified?: boolean;
      phoneNumber?: string;
      attributes?: Record<string, string[]>;
      requiredActions?: string[];
    }

    let data: AccountProfile;

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

    // Admin fetch — wymagane do mp_*_locked attributes (sticky security
    // locks po enforce). Account API nie zwraca custom attributes.
    let requiredActions = data.requiredActions || [];
    let adminAttributes: Record<string, string[]> = {};
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
        if (!requiredActions || requiredActions.length === 0) {
          requiredActions = userData.requiredActions || [];
        }
        adminAttributes = (userData.attributes as Record<string, string[]>) || {};
      }
    } catch (e) {
      console.warn("[account GET] Failed to fetch admin profile:", e);
    }
    requiredActions = keycloak.normalizeRequiredActions(requiredActions);

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
        ...(adminAttributes.mp_webauthn_locked
          ? { mp_webauthn_locked: adminAttributes.mp_webauthn_locked }
          : {}),
        ...(adminAttributes.mp_totp_locked
          ? { mp_totp_locked: adminAttributes.mp_totp_locked }
          : {}),
      },
      requiredActions: requiredActions,
    };

    return createSuccessResponse(mergedData);
  } catch (error) {
    return handleApiError(error);
  }
}

// Whitelist atrybutów, które user-facing /account może modyfikować.
// firstName/lastName/email są CELOWO read-only po stronie usera —
// admin-flow dla tych pól to /admin/users/[id]. Patrz feedback_security_no_runtime_toggle.
const USER_EDITABLE_ATTRIBUTES = new Set<string>(["phone-number"]);

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const accessToken = session.accessToken ?? "";
    const body = await request.json();
    const { firstName, lastName, email, attributes } = body as {
      firstName?: unknown;
      lastName?: unknown;
      email?: unknown;
      attributes?: Record<string, unknown>;
    };

    // Hard-reject zmian na polach należących do KC source-of-truth.
    // Whitelist approach — wszystko co poza phone-number zostaje odrzucone
    // z 400. Wysyłanie tych pól przez user-facing /account jest błędem
    // klienta (UI wystawia je read-only), więc nie próbujemy ich silently
    // ignorować — głośne 400 ułatwia diagnostykę.
    if (firstName !== undefined) {
      throw ApiError.badRequest(
        "Imienia nie można edytować z poziomu konta użytkownika",
        "firstName is read-only on user-facing /account; use /admin/users/:id",
      );
    }
    if (lastName !== undefined) {
      throw ApiError.badRequest(
        "Nazwiska nie można edytować z poziomu konta użytkownika",
        "lastName is read-only on user-facing /account; use /admin/users/:id",
      );
    }
    if (email !== undefined) {
      throw ApiError.badRequest(
        "Adresu email nie można edytować z poziomu konta użytkownika",
        "email is read-only on user-facing /account; use /admin/users/:id",
      );
    }

    if (attributes && typeof attributes === "object") {
      for (const key of Object.keys(attributes)) {
        if (!USER_EDITABLE_ATTRIBUTES.has(key)) {
          throw ApiError.badRequest(
            `Atrybut "${key}" nie może być edytowany z poziomu konta użytkownika`,
            `attribute "${key}" not in user-editable whitelist`,
          );
        }
      }
    }

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

    // Wyłącznie merge `phone-number` (i innych whitelisted attrs) —
    // zachowujemy resztę current user attributes intact. firstName /
    // lastName / email nie są w ogóle wkładane do updateBody.
    const filteredAttributes: Record<string, string[]> = {};
    if (attributes && typeof attributes === "object") {
      for (const key of Object.keys(attributes)) {
        if (!USER_EDITABLE_ATTRIBUTES.has(key)) continue;
        const value = (attributes as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
          filteredAttributes[key] = value.filter(
            (v): v is string => typeof v === "string",
          );
        }
      }
    }

    const updateBody: Record<string, unknown> = {
      attributes: {
        ...(currentUser.attributes || {}),
        ...filteredAttributes,
      },
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

    // Propagacja phone do natywnych providerów (Chatwoot/Directus/etc).
    // KC source-of-truth → kolejka z retry. firstName/lastName/email
    // niezmienione, więc jedyny powód propagacji to phone.
    const phoneChanged =
      filteredAttributes["phone-number"] !== undefined &&
      JSON.stringify(filteredAttributes["phone-number"]) !==
        JSON.stringify(currentUser.attributes?.["phone-number"] ?? []);
    if (phoneChanged) {
      void enqueueProfilePropagation(userId, {
        actor: session.user?.email ?? `user:${userId}`,
      }).catch((err) => {
        console.warn(
          "[API /account PUT] enqueueProfilePropagation failed:",
          err instanceof Error ? err.message : err,
        );
      });
    }

    return createSuccessResponse({
      googleDisconnected: false,
      profilePropagated: phoneChanged,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
