import { NextResponse } from "next/server";
import { getPublicLogoutRedirectUrl } from "@/lib/app-url";
import { keycloak } from "@/lib/keycloak";
import { getRequiredEnv } from "@/lib/env";

export async function GET() {
  const issuer = keycloak.getIssuer();
  const clientId = getRequiredEnv("KEYCLOAK_CLIENT_ID");
  const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);

  logoutUrl.searchParams.set(
    "post_logout_redirect_uri",
    getPublicLogoutRedirectUrl()
  );
  logoutUrl.searchParams.set("client_id", clientId);

  return NextResponse.redirect(logoutUrl);
}
