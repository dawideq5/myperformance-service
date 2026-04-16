import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

/**
 * POST /api/integrations/google/disconnect
 * Disconnects Google account from Keycloak Identity Provider
 */
export async function POST() {
  try {
    const session: any = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    // Get current user data
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

    // Remove Google identity provider link if exists
    const federatedIdentities = await identitiesResponse.json();
    const googleIdentity = federatedIdentities.find(
      (identity: any) => identity.identityProvider === "google"
    );

    if (googleIdentity) {
      // Delete the federated identity link
      const deleteResponse = await keycloak.adminRequest(
        `/users/${userId}/federated-identity/google`,
        serviceToken,
        { method: "DELETE" }
      );

      if (!deleteResponse.ok) {
        console.error("[Google Disconnect] Failed to remove federated identity");
        return NextResponse.json(
          { error: "Failed to remove federated identity" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Google Disconnect] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
