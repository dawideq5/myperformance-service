import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

// POST - Set required action for user (enables configuration at next login)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body; // 'CONFIGURE_TOTP', 'WEBAUTHN_REGISTER'

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    const requiredActionAlias = await keycloak.resolveRequiredActionAlias(serviceToken, keycloak.getRequiredActionAliases(action));

    if (!requiredActionAlias) {
      return NextResponse.json(
        {
          error: "Nie znaleziono aliasu required action w Keycloak",
          action,
        },
        { status: 400 }
      );
    }

    await keycloak.appendUserRequiredAction(serviceToken, userId, requiredActionAlias);

    return NextResponse.json({
      success: true,
      message: "Configuration will be required at next login",
      action: requiredActionAlias,
      requestedAction: action,
    });
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

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    const requiredActionAlias = await keycloak.resolveRequiredActionAlias(serviceToken, keycloak.getRequiredActionAliases(action));

    if (!requiredActionAlias) {
      return NextResponse.json(
        {
          error: "Nie znaleziono aliasu required action w Keycloak",
          action,
        },
        { status: 400 }
      );
    }

    await keycloak.removeUserRequiredAction(serviceToken, userId, requiredActionAlias);

    return NextResponse.json({ success: true, action: requiredActionAlias, requestedAction: action });
  } catch (error) {
    console.error("[API /required-actions DELETE] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
