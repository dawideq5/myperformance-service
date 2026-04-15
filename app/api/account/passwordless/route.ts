import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { getServiceAccountToken } from "@/lib/keycloak-admin";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = "MyPerformance";

// GET - Check current authentication flow configuration
export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has admin rights (realm-admin role)
    const tokenPayload = JSON.parse(
      Buffer.from(session.accessToken.split(".")[1], "base64").toString()
    );
    const roles = tokenPayload.realm_access?.roles || [];
    const isAdmin = roles.includes("realm-admin") || roles.includes("admin");

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Brak uprawnień administratora" },
        { status: 403 }
      );
    }

    const serviceToken = await getServiceAccountToken();

    // Get realm configuration
    const realmRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${REALM}`,
      {
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!realmRes.ok) {
      return NextResponse.json(
        { error: "Nie udało się pobrać konfiguracji realm" },
        { status: 500 }
      );
    }

    const realmData = await realmRes.json();

    const passwordlessFlows = ["browser-webauthn-passwordless"];
    const webauthnFlows = ["browser-webauthn-conditional", "browser-webauthn"];

    const isPasswordless = passwordlessFlows.includes(realmData.browserFlow);
    const isWebAuthn = webauthnFlows.includes(realmData.browserFlow) || isPasswordless;

    return NextResponse.json({
      enabled: isPasswordless,
      webauthnEnabled: isWebAuthn,
      currentFlow: realmData.browserFlow,
      availableFlows: [
        { id: "browser", name: "Standard (tylko hasło)" },
        { id: "browser-webauthn-conditional", name: "WebAuthn (hasło + klucz/2FA jeśli skonfigurowane)" },
        { id: "browser-webauthn-passwordless", name: "Passwordless (tylko klucz sprzętowy)" },
      ],
    });
  } catch (error) {
    console.error("[API /passwordless GET] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Toggle passwordless authentication
export async function POST(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has admin rights
    const tokenPayload = JSON.parse(
      Buffer.from(session.accessToken.split(".")[1], "base64").toString()
    );
    const roles = tokenPayload.realm_access?.roles || [];
    const isAdmin = roles.includes("realm-admin") || roles.includes("admin");

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Brak uprawnień administratora" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { enabled, flow } = body;

    const serviceToken = await getServiceAccountToken();

    // Get current realm configuration
    const realmRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${REALM}`,
      {
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!realmRes.ok) {
      return NextResponse.json(
        { error: "Nie udało się pobrać konfiguracji realm" },
        { status: 500 }
      );
    }

    const realmData = await realmRes.json();

    // Update browser flow
    const newFlow = flow || (enabled ? "browser-webauthn-passwordless" : "browser");
    realmData.browserFlow = newFlow;

    // Save updated realm configuration
    const updateRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${REALM}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(realmData),
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error("[API /passwordless POST] update error:", errText);
      return NextResponse.json(
        { error: "Nie udało się zaktualizować konfiguracji" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      enabled: newFlow === "browser-webauthn-passwordless",
      currentFlow: newFlow,
    });
  } catch (error) {
    console.error("[API /passwordless POST] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
