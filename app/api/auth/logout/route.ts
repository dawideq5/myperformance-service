import { NextResponse } from "next/server";
import { getPublicLogoutRedirectUrl } from "@/lib/app-url";
import { keycloak } from "@/lib/keycloak";
import { getRequiredEnv } from "@/lib/env";
import { log } from "@/lib/logger";

/**
 * GET /api/auth/logout
 *
 * Initiates Keycloak RP-Initiated Logout with post_logout_redirect_uri.
 */
export async function GET() {
  try {
    const issuer = keycloak.getIssuer();
    const clientId = getRequiredEnv("KEYCLOAK_CLIENT_ID");
    const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);

    const redirectUri = getPublicLogoutRedirectUrl();
    logoutUrl.searchParams.set("post_logout_redirect_uri", redirectUri);
    logoutUrl.searchParams.set("client_id", clientId);

    log.info("auth.logout.redirect", { redirectUri });

    return NextResponse.redirect(logoutUrl);
  } catch (error) {
    log.error("auth.logout.failed", { err: error });
    return NextResponse.redirect(new URL("/login", getPublicLogoutRedirectUrl()));
  }
}
