import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getPublicLogoutRedirectUrl } from "@/lib/app-url";
import { keycloak } from "@/lib/keycloak";
import { getRequiredEnv } from "@/lib/env";
import { authOptions } from "@/app/auth";

/**
 * GET /api/auth/logout
 * 
 * Initiates Keycloak logout flow with id_token_hint for proper session termination.
 * According to OpenID Connect RP-Initiated Logout spec, id_token_hint is recommended
 * to identify the user's session to terminate.
 */
export async function GET() {
  try {
    const issuer = keycloak.getIssuer();
    const clientId = getRequiredEnv("KEYCLOAK_CLIENT_ID");
    const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);

    const redirectUri = getPublicLogoutRedirectUrl();
    logoutUrl.searchParams.set("post_logout_redirect_uri", redirectUri);
    logoutUrl.searchParams.set("client_id", clientId);

    console.log("[logout] Redirecting to Keycloak logout:", logoutUrl.toString());
    console.log("[logout] Redirect URI:", redirectUri);

    return NextResponse.redirect(logoutUrl);
  } catch (error) {
    console.error("[logout] Error during logout:", error);
    // Fallback: redirect to login page if logout fails
    return NextResponse.redirect(new URL("/login", getPublicLogoutRedirectUrl()));
  }
}
