import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import {
  appendUserRequiredAction,
  getServiceAccountToken,
  getUserIdFromToken,
  resolveRequiredActionAlias,
} from "@/lib/keycloak-admin";
import { getAccountUrl, getAdminUrl } from "@/lib/keycloak-config";

// GET - List registered WebAuthn credentials
export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await fetch(
      getAccountUrl("/account/credentials"),
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

    const keys = (webauthnEntry?.userCredentialMetadatas || []).map((m: any) => {
      console.log("[API /webauthn GET] credential metadata:", JSON.stringify(m, null, 2));
      return {
        id: m.credential?.id,
        credentialId: m.credential?.id, // Add explicit credentialId field
        label: m.credential?.userLabel || "Klucz bezpieczeństwa",
        createdDate: m.credential?.createdDate,
      };
    });

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

    if (action === "prepare-passwordless") {
      const serviceToken = await getServiceAccountToken();
      const userId = await getUserIdFromToken(session.accessToken);
      const requiredActionAlias = await resolveRequiredActionAlias(serviceToken, [
        "webauthn-register-passwordless",
        "WEBAUTHN_REGISTER_PASSWORDLESS",
        "webauthn-register",
        "WEBAUTHN_REGISTER",
      ]);

      if (!requiredActionAlias) {
        return NextResponse.json(
          { error: "Brak wymaganej akcji WebAuthn w konfiguracji Keycloak" },
          { status: 400 }
        );
      }

      await appendUserRequiredAction(serviceToken, userId, requiredActionAlias);
      return NextResponse.json({ success: true, requiredAction: requiredActionAlias });
    }

    // Step 1: Get registration options
    if (action === "get-options") {
      const userId = await getUserIdFromToken(session.accessToken);

      // Get user info from Account API (no admin token needed)
      const profileRes = await fetch(
        getAccountUrl("/account"),
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
          residentKey: "preferred",
          userVerification: "required",
        },
        extensions: {
          credProps: true,
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

      try {
        const serviceToken = await getServiceAccountToken();

        // Get current user representation
        const userRes = await fetch(
          getAdminUrl(`/users/${userId}`),
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

        // Convert base64url to base64 for Keycloak compatibility
        const base64urlToBase64 = (base64url: string) => {
          return base64url.replace(/-/g, '+').replace(/_/g, '/');
        };

        // Check for duplicate credential (same credentialId)
        const existingCredentials = userData.credentials || [];
        const webauthnCredentials = existingCredentials.filter(
          (c: any) => c.type === "webauthn"
        );

        const credentialIdBase64 = base64urlToBase64(credential.id);
        for (const existingCred of webauthnCredentials) {
          try {
            const credData = JSON.parse(existingCred.credentialData || "{}");
            if (credData.credentialId === credentialIdBase64 || credData.credentialId === credential.id) {
              return NextResponse.json(
                { error: "Ten klucz bezpieczeństwa jest już zarejestrowany" },
                { status: 409 }
              );
            }
          } catch {}
        }

        // Decode attestation to get proper aaguid if available
        let aaguid = "00000000-0000-0000-0000-000000000000";
        try {
          const attestationBytes = Uint8Array.from(atob(credential.attestationObject), c => c.charCodeAt(0));
          // AAGUID is at offset 37-53 in authData within attestation
          // This is simplified - in production use proper CBOR parsing
          const authDataOffset = 37; // After RP ID hash
          if (attestationBytes.length > authDataOffset + 16) {
            const aaguidBytes = attestationBytes.slice(authDataOffset, authDataOffset + 16);
            // Convert to UUID format
            const hex = Array.from(aaguidBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            if (hex !== '00000000000000000000000000000000') {
              aaguid = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
            }
          }
        } catch {}

        // Add WebAuthn credential via PUT /users/{id}
        const webauthnCredential = {
          type: "webauthn",
          userLabel: label || "Klucz bezpieczeństwa",
          credentialData: JSON.stringify({
            credentialId: base64urlToBase64(credential.id),
            credentialPublicKey: credential.publicKey || "",
            counter: 0,
            aaguid: aaguid,
            attestationStatementFormat: "none",
          }),
          secretData: JSON.stringify({}),
        };

        const updateRes = await fetch(
          getAdminUrl(`/users/${userId}`),
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

        if (updateRes.ok || updateRes.status === 204) {
          const requiredActionAlias = await resolveRequiredActionAlias(serviceToken, [
            "webauthn-register-passwordless",
            "WEBAUTHN_REGISTER_PASSWORDLESS",
            "webauthn-register",
            "WEBAUTHN_REGISTER",
          ]);
          if (requiredActionAlias) {
            await appendUserRequiredAction(serviceToken, userId, requiredActionAlias);
          }
          return NextResponse.json({ success: true });
        }

        const errText = await updateRes.text();
        return NextResponse.json(
          { error: `Nie udało się zarejestrować klucza: ${errText}` },
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

// PUT - Rename a WebAuthn credential
export async function PUT(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { credentialId, newName } = body;

    if (!credentialId || !newName) {
      return NextResponse.json(
        { error: "Missing credentialId or newName" },
        { status: 400 }
      );
    }

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const userId = await getUserIdFromToken(session.accessToken);
    const serviceToken = await getServiceAccountToken();

    console.log("[API /webauthn PUT] renaming credential:", credentialId, "to:", newName);

    // Use dedicated Keycloak endpoint for updating credential userLabel
    const updateRes = await fetch(
      `${keycloakUrl}/admin/realms/MyPerformance/users/${userId}/credentials/${credentialId}/userLabel`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newName),
      }
    );

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error("[API /webauthn PUT] error:", errorText);
      return NextResponse.json(
        { error: "Failed to update credential label", details: errorText },
        { status: updateRes.status }
      );
    }

    console.log("[API /webauthn PUT] successfully renamed credential");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /webauthn PUT] error:", error);
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

    // Try Account API first
    let deleteResponse = await fetch(
      getAccountUrl(`/account/credentials/${credentialId}`),
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }
    );

    if (!deleteResponse.ok) {
      const adminToken = await getServiceAccountToken();
      const userId = await getUserIdFromToken(session.accessToken);

      deleteResponse = await fetch(
        getAdminUrl(`/users/${userId}/credentials/${credentialId}`),
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
