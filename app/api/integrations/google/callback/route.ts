import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

/**
 * GET /api/integrations/google/callback
 * Handles Google OAuth callback from Keycloak Identity Provider
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  console.log("[Google Callback] Callback received, URL:", request.url);
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    console.log("[Google Callback] Params - code:", !!code, "state:", !!state, "error:", error);

    // Handle errors from Keycloak/IdP
    if (error) {
      console.error("[Google Callback] OAuth error:", error, errorDescription);
      return NextResponse.redirect(
        `${baseUrl}/account?tab=integrations&error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      console.error("[Google Callback] Missing params - code:", code, "state:", state);
      return NextResponse.redirect(
        `${baseUrl}/account?tab=integrations&error=missing_params`
      );
    }

    // Validate state parameter
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString());
      console.log("[Google Callback] State data:", stateData);
    } catch (err) {
      console.error("[Google Callback] Failed to parse state:", err);
      return NextResponse.redirect(
        `${baseUrl}/account?tab=integrations&error=invalid_state`
      );
    }

    // Check state expiration (5 minutes)
    const stateAge = Date.now() - (stateData.timestamp || 0);
    if (stateAge > 5 * 60 * 1000) {
      console.error("[Google Callback] State expired, age:", stateAge);
      return NextResponse.redirect(
        `${baseUrl}/account?tab=integrations&error=state_expired`
      );
    }

    // Exchange code for tokens via Keycloak
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/integrations/google/callback`;
    console.log("[Google Callback] Exchanging code for tokens, redirectUri:", redirectUri);

    const tokenResponse = await fetch(
      keycloak.getAccountUrl("/protocol/openid-connect/token"),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
          code,
          redirect_uri: redirectUri,
        }),
      }
    );

    console.log("[Google Callback] Token response status:", tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[Google Callback] Token exchange failed:", errorText);
      return NextResponse.redirect(
        `${baseUrl}/account?tab=integrations&error=token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();
    console.log("[Google Callback] Tokens received, access_token:", !!tokens.access_token);

    // Store Google connection info in user attributes
    const session: any = await getServerSession(authOptions);
    console.log("[Google Callback] Session:", !!session, "accessToken:", !!session?.accessToken);

    if (session?.accessToken) {
      const userId = await keycloak.getUserIdFromToken(session.accessToken);
      const serviceToken = await keycloak.getServiceAccountToken();
      console.log("[Google Callback] User ID:", userId, "Service token:", !!serviceToken);

      try {
        // Fetch current user data
        const userResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
        const userData = await userResponse.json();
        console.log("[Google Callback] Current attributes:", userData.attributes);

        // Keycloak requires full user object with merged attributes
        const updatedUser = {
          ...userData,
          attributes: {
            ...(userData.attributes || {}),
            google_connected: ["true"],
            google_connected_at: [new Date().toISOString()],
            google_scopes: ["email", "calendar", "gmail.labels", "gmail.settings.basic"],
          },
        };
        console.log("[Google Callback] Sending updated user with attrs:", updatedUser.attributes);

        const updateResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken, {
          method: "PUT",
          body: JSON.stringify(updatedUser),
        });

        console.log("[Google Callback] Update response status:", updateResponse.status);
        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error("[Google Callback] Update error:", errorText);
        } else {
          // Verify by fetching again
          const verifyResponse = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
          const verifyData = await verifyResponse.json();
          console.log("[Google Callback] Verified attributes:", verifyData.attributes);
        }
      } catch (updateError) {
        console.error("[Google Callback] Failed to update attributes:", updateError);
      }
    } else {
      console.error("[Google Callback] No valid session or access token");
    }

    // Redirect back to account page with success
    console.log("[Google Callback] Redirecting to /account?tab=integrations&google_connected=true");
    return NextResponse.redirect(`${baseUrl}/account?tab=integrations&google_connected=true`);
  } catch (error) {
    console.error("[Google Callback] Error:", error);
    return NextResponse.redirect(
      `${baseUrl}/account?tab=integrations&error=internal_error`
    );
  }
}
