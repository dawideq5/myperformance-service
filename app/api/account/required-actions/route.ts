import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { getServiceAccountToken, getUserIdFromToken } from "@/lib/keycloak-admin";

// POST - Set required action for user (enables configuration at next login)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body; // 'CONFIGURE_TOTP', 'WEBAUTHN_REGISTER', 'WEBAUTHN_REGISTER_PASSWORDLESS'

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const userId = await getUserIdFromToken(session.accessToken);
    const serviceToken = await getServiceAccountToken();

    // Get current user data
    const userRes = await fetch(
      `${keycloakUrl}/admin/realms/MyPerformance/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${serviceToken}`,
        },
      }
    );

    if (!userRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: 500 }
      );
    }

    const userData = await userRes.json();

    // Add required action if not already present
    const currentActions = userData.requiredActions || [];
    if (!currentActions.includes(action)) {
      // Build minimal user object with required actions
      // Keycloak requires specific fields to be present
      const updatedUser = {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        firstName: userData.firstName || "",
        lastName: userData.lastName || "",
        enabled: userData.enabled !== false,
        emailVerified: userData.emailVerified || false,
        requiredActions: [...currentActions, action],
        attributes: userData.attributes || {},
      };

      console.log("[API /required-actions POST] updating user with:", JSON.stringify(updatedUser, null, 2));

      const updateRes = await fetch(
        `${keycloakUrl}/admin/realms/MyPerformance/users/${userId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${serviceToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedUser),
        }
      );

      if (!updateRes.ok) {
        const errorText = await updateRes.text();
        console.error("[API /required-actions POST] error:", errorText);
        return NextResponse.json(
          { error: "Failed to set required action", details: errorText },
          { status: updateRes.status }
        );
      }

      // Add delay to allow Keycloak cache to update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the action was actually set
      const verifyRes = await fetch(
        `${keycloakUrl}/admin/realms/MyPerformance/users/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
            Accept: "application/json",
          },
        }
      );

      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        console.log("[API /required-actions POST] verification - requiredActions:", verifyData.requiredActions);
        if (!verifyData.requiredActions?.includes(action)) {
          console.error("[API /required-actions POST] verification failed - action not found");
          return NextResponse.json(
            { error: "Required action was not saved properly" },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({ 
        success: true, 
        message: "Configuration will be required at next login",
        action 
      });
    } else {
      return NextResponse.json({ 
        success: true, 
        message: "Configuration will be required at next login",
        action 
      });
    }
  } catch (error) {
    console.error("[API /required-actions POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Remove required action
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const userId = await getUserIdFromToken(session.accessToken);
    const serviceToken = await getServiceAccountToken();

    const userRes = await fetch(
      `${keycloakUrl}/admin/realms/MyPerformance/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${serviceToken}`,
        },
      }
    );

    if (!userRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: 500 }
      );
    }

    const userData = await userRes.json();
    const currentActions = userData.requiredActions || [];

    // Remove the action
    const newActions = currentActions.filter((a: string) => a !== action);

    // Build minimal user object with updated required actions
    const updatedUser = {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      enabled: userData.enabled !== false,
      emailVerified: userData.emailVerified || false,
      requiredActions: newActions,
      attributes: userData.attributes || {},
    };

    const updateRes = await fetch(
      `${keycloakUrl}/admin/realms/MyPerformance/users/${userId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedUser),
      }
    );

    if (!updateRes.ok) {
      return NextResponse.json(
        { error: "Failed to remove required action" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /required-actions DELETE] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
