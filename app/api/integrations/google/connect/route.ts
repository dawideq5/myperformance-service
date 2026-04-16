import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

/**
 * POST /api/integrations/google/connect
 * Initiates Google OAuth connection via Keycloak Identity Provider
 */
export async function POST() {
  try {
    const session: any = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    // Get user data to check if already linked
    const identitiesResponse = await keycloak.adminRequest(
      `/users/${userId}/federated-identity`,
      serviceToken
    );
    if (!identitiesResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: 500 }
      );
    }

    const federatedIdentities = await identitiesResponse.json();

    // Check if Google is already linked
    const googleLinked = federatedIdentities.some(
      (identity: any) => identity.identityProvider === "google"
    );

    if (googleLinked) {
      return NextResponse.json(
        { error: "Google account already connected" },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl}/account?tab=integrations&google_linking=1`;
    const { url, nonce, hash, sessionState, clientId } = keycloak.getBrokerLinkUrl(
      "google",
      session.accessToken,
      redirectUri,
      process.env.KEYCLOAK_CLIENT_ID?.trim()
    );

    console.log("[Google Connect] Broker link params:", {
      userId,
      provider: "google",
      redirectUri,
      clientId,
      sessionState,
      nonce,
      hash,
      url,
    });

    return NextResponse.json({
      authorizationUrl: url,
    });
  } catch (error) {
    console.error("[Google Connect] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
