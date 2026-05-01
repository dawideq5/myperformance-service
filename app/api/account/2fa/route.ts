export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { withAdminContext } from "@/lib/keycloak-admin";

interface TwoFactorStatus {
  enabled: boolean;
  configured: boolean;
}

async function fetchAccountCredentials(accessToken: string): Promise<unknown[]> {
  const res = await fetch(keycloak.getAccountUrl("/account/credentials"), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

interface KeycloakCredential {
  type?: string;
  userCredentialMetadatas?: Array<{ credential?: { id?: string } }>;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const credentials = (await fetchAccountCredentials(
      session.accessToken ?? "",
    )) as KeycloakCredential[];
    const otp = credentials.find((c) => c?.type === "otp");
    const configured = (otp?.userCredentialMetadatas?.length ?? 0) > 0;

    const body: TwoFactorStatus = { enabled: configured, configured };
    return createSuccessResponse(body);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const accessToken = session.accessToken ?? "";
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Invalid JSON body");
    }
    const { action, totpCode, secret } = body as {
      action?: string;
      totpCode?: string;
      secret?: string;
    };

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
      const qrCode = await QRCode.toDataURL(otpauthUri, {
        width: 256,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      return createSuccessResponse({
        qrCode,
        secret: totp.secret.base32,
        otpauthUri,
      });
    }

    if (action === "verify") {
      if (!totpCode || !secret) {
        throw ApiError.badRequest("Brakuje kodu lub sekretu");
      }

      const userSub =
        session.user?.id ||
        session.user?.email ||
        "anon";
      const ipKey = getClientIp(request);
      const rl = rateLimit(`totp:${userSub}:${ipKey}`, {
        capacity: 10,
        refillPerSec: 10 / (5 * 60),
      });
      if (!rl.allowed) {
        return new Response(
          JSON.stringify({
            error: {
              code: "BAD_REQUEST",
              message:
                "Zbyt wiele prób weryfikacji. Spróbuj ponownie później.",
            },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
            },
          },
        );
      }

      const totp = new OTPAuth.TOTP({
        issuer: "MyPerformance",
        label: session.user?.email || "user",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        throw ApiError.badRequest("Nieprawidłowy kod weryfikacyjny");
      }

      await withAdminContext(accessToken, async (adminToken, userId) => {
        const userRes = await keycloak.adminRequest(
          `/users/${userId}`,
          adminToken,
        );
        if (!userRes.ok) {
          throw ApiError.serviceUnavailable(
            "Nie udało się pobrać danych użytkownika",
          );
        }
        const userData = await userRes.json();

        const updateRes = await keycloak.adminRequest(
          `/users/${userId}`,
          adminToken,
          {
            method: "PUT",
            body: JSON.stringify({
              ...userData,
              credentials: [
                ...(userData.credentials || []),
                {
                  type: "otp",
                  userLabel: "MyPerformance Authenticator",
                  secretData: JSON.stringify({ value: secret }),
                  credentialData: JSON.stringify({
                    subType: "totp",
                    digits: 6,
                    period: 30,
                    algorithm: "HmacSHA1",
                  }),
                },
              ],
            }),
          },
        );
        if (!updateRes.ok) {
          throw ApiError.serviceUnavailable(
            "Nie udało się zapisać konfiguracji 2FA",
          );
        }
      });

      return createSuccessResponse({ success: true, enabled: true });
    }

    throw ApiError.badRequest("Invalid action");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const accessToken = session.accessToken ?? "";

    // Admin-forced check: CONFIGURE_TOTP w requiredActions LUB sticky
    // attribute mp_totp_locked (po wykonaniu setupu zostaje sticky lock).
    await withAdminContext(accessToken, async (adminToken, userId) => {
      const userResp = await keycloak.adminRequest(
        `/users/${userId}`,
        adminToken,
      );
      if (!userResp.ok) return;
      const userData = await userResp.json();
      const normalized = keycloak.normalizeRequiredActions(
        userData.requiredActions || [],
      );
      const stickyLocked =
        userData.attributes?.mp_totp_locked?.[0] === "true";
      if (normalized.includes("CONFIGURE_TOTP") || stickyLocked) {
        throw new ApiError(
          "FORBIDDEN",
          "Aplikacja uwierzytelniająca została wymuszona przez administratora i nie może zostać usunięta.",
          403,
          "admin_forced",
        );
      }
    });

    const credentials = (await fetchAccountCredentials(
      accessToken,
    )) as KeycloakCredential[];
    const otp = credentials.find((c) => c?.type === "otp");
    const credentialId = otp?.userCredentialMetadatas?.[0]?.credential?.id;
    if (!credentialId) {
      return createSuccessResponse({ success: true, enabled: false });
    }

    let deleteResponse = await fetch(
      keycloak.getAccountUrl(`/account/credentials/${credentialId}`),
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!deleteResponse.ok) {
      deleteResponse = await withAdminContext(
        accessToken,
        async (adminToken, userId) =>
          keycloak.adminRequest(
            `/users/${userId}/credentials/${credentialId}`,
            adminToken,
            { method: "DELETE" },
          ),
      );
    }

    if (!deleteResponse.ok) {
      throw ApiError.serviceUnavailable("Nie udało się wyłączyć 2FA");
    }

    return createSuccessResponse({ success: true, enabled: false });
  } catch (error) {
    return handleApiError(error);
  }
}
