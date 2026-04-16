import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

/**
 * GET /api/integrations/google/link-url
 *
 * Generates a Keycloak authorization URL with kc_idp_hint=google to initiate
 * Google account linking. This approach is more reliable than the broker link
 * endpoint which requires complex hash/session validation.
 *
 * The flow:
 * 1. User is redirected to Keycloak with kc_idp_hint=google
 * 2. Keycloak initiates Google OAuth flow
 * 3. After successful Google auth, Keycloak links the accounts
 * 4. User is redirected back to the app
 */
export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/integrations/google/callback`;

    // Get client ID from token
    const payload = keycloak.decodeTokenPayload(session.accessToken);
    const clientId = payload.azp || payload.client_id || "dashboard-myperformance-pl";

    // Build Keycloak authorization URL with IdP hint
    const authUrl = new URL(`${keycloak.getPublicIssuer()}/protocol/openid-connect/auth`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid");
    authUrl.searchParams.set("kc_idp_hint", "google");
    // Generate state that includes the final redirect info
    const stateData = Buffer.from(JSON.stringify({
      finalRedirect: `${appUrl}/account?tab=integrations&google_linking=1`,
      nonce: crypto.randomUUID(),
    })).toString("base64url");
    authUrl.searchParams.set("state", stateData);

    console.log("[Google Link URL] Using IdP hint approach");
    console.log("[Google Link URL] Auth URL:", authUrl.toString());

    return NextResponse.json({ url: authUrl.toString() });
  } catch (err: any) {
    console.error("[Google Link URL] Error generating link URL:", err?.message);
    return NextResponse.json(
      { error: err?.message || "Failed to generate link URL" },
      { status: 500 }
    );
  }
}
