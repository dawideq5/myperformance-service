import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

import { keycloak } from "@/lib/keycloak";

// GET - Check 2FA status
export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await fetch(
      keycloak.getAccountUrl("/account/credentials"),
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ enabled: false, configured: false });
    }

    const credentials = await response.json();
    const otpCredential = Array.isArray(credentials)
      ? credentials.find((c: any) => c.type === "otp")
      : null;

    const hasOtpConfigured = otpCredential?.userCredentialMetadatas?.length > 0;

    return NextResponse.json({
      enabled: hasOtpConfigured,
      configured: hasOtpConfigured,
    });
  } catch (error) {
    console.error("[API /2fa GET] error:", error);
    return NextResponse.json({ enabled: false, configured: false });
  }
}

// POST - Generate QR code or verify TOTP and enable 2FA
export async function POST(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, totpCode, secret } = body;

    if (action === "prepare") {
      const serviceToken = await keycloak.getServiceAccountToken();
      const userId = await keycloak.getUserIdFromToken(session.accessToken);
      const requiredActionAlias = await keycloak.resolveRequiredActionAlias(serviceToken, [
        "CONFIGURE_TOTP",
      ]);

      if (!requiredActionAlias) {
        return NextResponse.json(
          { error: "Brak wymaganej akcji CONFIGURE_TOTP w konfiguracji Keycloak" },
          { status: 400 }
        );
      }

      await keycloak.appendUserRequiredAction(serviceToken, userId, requiredActionAlias);
      return NextResponse.json({ success: true, requiredAction: requiredActionAlias });
    }

    // Step 1: Generate new TOTP secret + QR code
    if (action === "generate") {
      const userEmail = session.user?.email || "user";
      const totp = new OTPAuth.TOTP({
        issuer: "MyPerformance",
        label: userEmail,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: new OTPAuth.Secret({ size: 20 }),
      });

      const otpauthUri = totp.toString();
      const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
        width: 256,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      return NextResponse.json({
        qrCode: qrDataUrl,
        secret: totp.secret.base32,
        otpauthUri,
      });
    }

    // Step 2: Verify TOTP code and register in Keycloak
    if (action === "verify") {
      if (!totpCode || !secret) {
        return NextResponse.json(
          { error: "Brakuje kodu lub sekretu" },
          { status: 400 }
        );
      }

      // Verify the TOTP code locally first
      const totp = new OTPAuth.TOTP({
        issuer: "MyPerformance",
        label: session.user?.email || "user",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      const delta = totp.validate({ token: totpCode, window: 1 });
      if (delta === null) {
        return NextResponse.json(
          { error: "Nieprawidłowy kod weryfikacyjny" },
          { status: 400 }
        );
      }

      // Get service account token and user ID
      const serviceToken = await keycloak.getServiceAccountToken();
      const userId = await keycloak.getUserIdFromToken(session.accessToken);

      // Get current user representation
      const userRes = await fetch(
        keycloak.getAdminUrl(`/users/${userId}`),
        {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!userRes.ok) {
        console.error("[API /2fa POST verify] Failed to get user:", userRes.status);
        return NextResponse.json(
          { error: "Nie udało się pobrać danych użytkownika. Sprawdź rolę manage-users na service account." },
          { status: 500 }
        );
      }

      const userData = await userRes.json();

      // Add OTP credential via PUT /users/{id} with credentials array
      const otpCredential = {
        type: "otp",
        userLabel: "MyPerformance Authenticator",
        secretData: JSON.stringify({ value: secret }),
        credentialData: JSON.stringify({
          subType: "totp",
          digits: 6,
          period: 30,
          algorithm: "HmacSHA1",
        }),
      };

      const updateRes = await fetch(
        keycloak.getAdminUrl(`/users/${userId}`),
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
              otpCredential,
            ],
          }),
        }
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        return NextResponse.json(
          { error: "Nie udało się zapisać konfiguracji 2FA." },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, enabled: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[API /2fa POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Remove 2FA
export async function DELETE() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const credsResponse = await fetch(
      keycloak.getAccountUrl("/account/credentials"),
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!credsResponse.ok) {
      return NextResponse.json(
        { error: "Nie udało się pobrać danych" },
        { status: credsResponse.status }
      );
    }

    const credentials = await credsResponse.json();
    const otpEntry = Array.isArray(credentials)
      ? credentials.find((c: any) => c.type === "otp")
      : null;

    const credentialId = otpEntry?.userCredentialMetadatas?.[0]?.credential?.id;

    if (!credentialId) {
      return NextResponse.json({ success: true, enabled: false });
    }

    // Try Account API first
    let deleteResponse = await fetch(
      keycloak.getAccountUrl(`/account/credentials/${credentialId}`),
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }
    );

    // If Account API fails, use Admin API
    if (!deleteResponse.ok) {
      const adminToken = await keycloak.getServiceAccountToken();
      const userId = await keycloak.getUserIdFromToken(session.accessToken);

      deleteResponse = await fetch(
        keycloak.getAdminUrl(`/users/${userId}/credentials/${credentialId}`),
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
    }

    if (!deleteResponse.ok) {
      return NextResponse.json(
        { error: "Nie udało się wyłączyć 2FA" },
        { status: deleteResponse.status }
      );
    }

    return NextResponse.json({ success: true, enabled: false });
  } catch (error) {
    console.error("[API /2fa DELETE] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
