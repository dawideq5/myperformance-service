import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { getServiceAccountToken, getUserIdFromToken } from "@/lib/keycloak-admin";

// GET - List registered WebAuthn credentials
export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const response = await fetch(
      `${keycloakUrl}/realms/MyPerformance/account/credentials`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ keys: [] });
    }

    const credentials = await response.json();
    const webauthnEntry = Array.isArray(credentials)
      ? credentials.find((c: any) => c.type === "webauthn")
      : null;

    const keys = (webauthnEntry?.userCredentialMetadatas || []).map((m: any) => ({
      id: m.credential?.id,
      label: m.credential?.userLabel || "Klucz bezpieczeństwa",
      createdDate: m.credential?.createdDate,
    }));

    return NextResponse.json({ keys, hasWebAuthn: keys.length > 0 });
  } catch (error) {
    console.error("[API /webauthn GET] error:", error);
    return NextResponse.json({ keys: [], hasWebAuthn: false });
  }
}

// POST - Register a new WebAuthn credential
export async function POST(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    // Step 1: Get registration options
    if (action === "get-options") {
      const userId = await getUserIdFromToken(session.accessToken);

      // Get user info from Account API (no admin token needed)
      const keycloakUrl = process.env.KEYCLOAK_URL;
      const profileRes = await fetch(
        `${keycloakUrl}/realms/MyPerformance/account`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/json",
          },
        }
      );

      let userName = session.user?.email || "user";
      let displayName = session.user?.name || userName;

      if (profileRes.ok) {
        const profile = await profileRes.json();
        userName = profile.username || profile.email || userName;
        displayName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || userName;
      }

      // Generate challenge
      const challengeBuffer = new Uint8Array(32);
      crypto.getRandomValues(challengeBuffer);
      const challenge = Buffer.from(challengeBuffer).toString("base64url");

      const options = {
        challenge,
        rp: {
          name: "MyPerformance",
        },
        user: {
          id: Buffer.from(userId).toString("base64url"),
          name: userName,
          displayName,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },   // ES256
          { alg: -257, type: "public-key" },  // RS256
        ],
        timeout: 60000,
        attestation: "none",
        authenticatorSelection: {
          requireResidentKey: false,
          userVerification: "preferred",
        },
      };

      return NextResponse.json({ options, challenge });
    }

    // Step 2: Save the registered credential
    if (action === "register") {
      const { credential, label } = body;

      if (!credential) {
        return NextResponse.json(
          { error: "Brakuje danych credential" },
          { status: 400 }
        );
      }

      const userId = await getUserIdFromToken(session.accessToken);
      const keycloakUrl = process.env.KEYCLOAK_URL;

      try {
        const serviceToken = await getServiceAccountToken();

        // Get current user representation
        const userRes = await fetch(
          `${keycloakUrl}/admin/realms/MyPerformance/users/${userId}`,
          {
            headers: {
              Authorization: `Bearer ${serviceToken}`,
              Accept: "application/json",
            },
          }
        );

        if (!userRes.ok) {
          return NextResponse.json(
            { error: "Nie udało się pobrać danych użytkownika. Sprawdź rolę manage-users." },
            { status: 500 }
          );
        }

        const userData = await userRes.json();

        // Add WebAuthn credential via PUT /users/{id}
        const webauthnCredential = {
          type: "webauthn",
          userLabel: label || "Klucz bezpieczeństwa",
          credentialData: JSON.stringify({
            credentialId: credential.id,
            credentialPublicKey: credential.publicKey || "",
            counter: 0,
            aaguid: "00000000-0000-0000-0000-000000000000",
            attestationStatementFormat: "none",
          }),
          secretData: JSON.stringify({}),
        };

        const updateRes = await fetch(
          `${keycloakUrl}/admin/realms/MyPerformance/users/${userId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${serviceToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...userData,
              credentials: [
                ...(userData.credentials || []),
                webauthnCredential,
              ],
            }),
          }
        );

        console.log("[API /webauthn POST register] response:", updateRes.status);

        if (updateRes.ok || updateRes.status === 204) {
          return NextResponse.json({ success: true });
        }

        const errText = await updateRes.text();
        console.error("[API /webauthn POST register] error:", errText);
        return NextResponse.json(
          { error: "Nie udało się zarejestrować klucza." },
          { status: 500 }
        );
      } catch (err) {
        console.error("[API /webauthn POST register] error:", err);
        return NextResponse.json(
          { error: "Nie udało się zarejestrować klucza. Sprawdź konfigurację service account." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[API /webauthn POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a WebAuthn credential
export async function DELETE(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get("id");

    if (!credentialId) {
      return NextResponse.json({ error: "Missing credential ID" }, { status: 400 });
    }

    const keycloakUrl = process.env.KEYCLOAK_URL;

    // Try Account API first
    let deleteResponse = await fetch(
      `${keycloakUrl}/realms/MyPerformance/account/credentials/${credentialId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }
    );

    if (!deleteResponse.ok) {
      const adminToken = await getServiceAccountToken();
      const userId = await getUserIdFromToken(session.accessToken);

      deleteResponse = await fetch(
        `${keycloakUrl}/admin/realms/MyPerformance/users/${userId}/credentials/${credentialId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
    }

    if (!deleteResponse.ok) {
      return NextResponse.json(
        { error: "Nie udało się usunąć klucza" },
        { status: deleteResponse.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /webauthn DELETE] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
