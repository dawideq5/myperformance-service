import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

/**
 * GET /api/integrations/google/status
 * Returns Google integration status for the current user
 */
export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    // Get user data
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
    const googleIdentity = federatedIdentities.find(
      (identity: any) => identity.identityProvider === "google"
    );

    return NextResponse.json({
      connected: Boolean(googleIdentity),
      provider: googleIdentity ? "keycloak" : null,
      email: googleIdentity?.userName || null,
      scopes: googleIdentity ? ["email", "calendar", "gmail.labels", "gmail.settings.basic"] : [],
      connectedAt: null,
    });
  } catch (error) {
    console.error("[Google Status] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
