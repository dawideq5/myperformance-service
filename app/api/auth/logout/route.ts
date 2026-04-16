import { NextResponse } from "next/server";
import { getPublicLogoutRedirectUrl } from "@/lib/app-url";
import { getKeycloakIssuer } from "@/lib/keycloak-config";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

export async function GET() {
  const issuer = getKeycloakIssuer();
  const clientId = getRequiredEnv("KEYCLOAK_CLIENT_ID");
  const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);

  logoutUrl.searchParams.set(
    "post_logout_redirect_uri",
    getPublicLogoutRedirectUrl()
  );
  logoutUrl.searchParams.set("client_id", clientId);

  return NextResponse.redirect(logoutUrl);
}
