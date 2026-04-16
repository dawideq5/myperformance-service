import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";

import { keycloak } from "@/lib/keycloak";

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use UserInfo endpoint (standard OIDC) + JWT token for attributes
    const userInfoUrl = `${keycloak.getIssuer()}/protocol/openid-connect/userinfo`;

    const response = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch profile", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract additional fields from JWT token (standard OIDC approach)
    const tokenPayload = keycloak.decodeTokenPayload(session.accessToken);

    // Merge UserInfo with JWT token data including custom claims (e.g., phone_number)
    const mergedData = {
      ...data,
      username: tokenPayload.preferred_username || data.preferred_username,
      firstName: tokenPayload.given_name || data.given_name,
      lastName: tokenPayload.family_name || data.family_name,
      emailVerified: tokenPayload.email_verified || data.email_verified,
      // Custom claims from protocol mappers (e.g., phone_number)
      attributes: {
        "phone-number": tokenPayload.phone_number ? [tokenPayload.phone_number] : [],
      },
    };

    // In standard OIDC, required actions should be in the token as a custom claim
    // For now, return empty array - they should be added via Keycloak protocol mappers
    mergedData.requiredActions = [];

    return NextResponse.json(mergedData);
  } catch (error) {
    console.error("[API /account GET] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { firstName, lastName, email, attributes } = body;

    // Step 1: Get current profile via Account API (no admin token needed)
    const currentProfileRes = await fetch(keycloak.getAccountUrl("/account"), {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!currentProfileRes.ok) {
      const errorText = await currentProfileRes.text();
      return NextResponse.json(
        { error: "Failed to fetch current profile", details: errorText },
        { status: currentProfileRes.status }
      );
    }

    const currentProfile = await currentProfileRes.json();
    const isEmailChanged = email && email !== currentProfile.email;

    // Step 2: Update profile via Account REST API (user-scoped, no admin rights needed)
    // This follows enterprise security principle: users update their own data
    const accountUpdateBody: Record<string, any> = {};
    if (firstName !== undefined) accountUpdateBody.firstName = firstName;
    if (lastName !== undefined) accountUpdateBody.lastName = lastName;
    if (email !== undefined) accountUpdateBody.email = email;

    // Build merged attributes
    const mergedAttributes = {
      ...(currentProfile.attributes || {}),
      ...(attributes || {}),
    };
    accountUpdateBody.attributes = mergedAttributes;

    const updateRes = await fetch(keycloak.getAccountUrl("/account"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(accountUpdateBody),
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      return NextResponse.json(
        { error: "Failed to update profile", details: errorText },
        { status: updateRes.status }
      );
    }

    // Step 3: Handle email change side effects (requires Admin API for federated identity)
    let googleDisconnected = false;
    if (isEmailChanged) {
      try {
        const userId = await keycloak.getUserIdFromToken(session.accessToken);
        const serviceToken = await keycloak.getServiceAccountToken();

        await keycloak.removeFederatedIdentity(serviceToken, userId, "google");
        await keycloak.updateUserAttributes(serviceToken, userId, {
          google_features_requested: [],
        });
        googleDisconnected = true;
      } catch (disconnectErr) {
        console.error(
          "[API /account PUT] Failed to disconnect Google after email change:",
          disconnectErr
        );
        // Non-fatal: profile was updated successfully
      }
    }

    return NextResponse.json({ success: true, googleDisconnected });
  } catch (error) {
    console.error("[API /account PUT] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
