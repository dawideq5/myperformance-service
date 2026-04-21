export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { withAdminContext } from "@/lib/keycloak-admin";

const MAX_WEBAUTHN_KEYS = 2;

function base64urlToBase64(value: string): string {
  return value.replace(/-/g, "+").replace(/_/g, "/");
}

function extractAaguid(attestationObject: string): string {
  const fallback = "00000000-0000-0000-0000-000000000000";
  try {
    const bytes = Uint8Array.from(atob(attestationObject), (c) =>
      c.charCodeAt(0),
    );
    const authDataOffset = 37;
    if (bytes.length < authDataOffset + 16) return fallback;
    const aaguidBytes = bytes.slice(authDataOffset, authDataOffset + 16);
    const hex = Array.from(aaguidBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hex === "00000000000000000000000000000000") return fallback;
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return fallback;
  }
}

async function fetchAccountCredentials(accessToken: string): Promise<any[]> {
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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const credentials = await fetchAccountCredentials(
      (session as any).accessToken,
    );
    const webauthn = credentials.find((c: any) => c?.type === "webauthn");
    const keys = (webauthn?.userCredentialMetadatas || []).map((m: any) => ({
      id: m.credential?.id,
      credentialId: m.credential?.id,
      label: m.credential?.userLabel || "Klucz bezpieczeństwa",
      createdDate: m.credential?.createdDate,
    }));

    return createSuccessResponse({ keys, hasWebAuthn: keys.length > 0 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const accessToken = (session as any).accessToken as string;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Invalid JSON body");
    }
    const { action } = body as { action?: string };

    if (action === "get-options") {
      const userId = await keycloak.getUserIdFromToken(accessToken);

      const profileRes = await fetch(keycloak.getAccountUrl("/account"), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      let userName = (session as any).user?.email || "user";
      let displayName = (session as any).user?.name || userName;

      if (profileRes.ok) {
        const profile = await profileRes.json();
        userName = profile.username || profile.email || userName;
        displayName =
          `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
          userName;
      }

      const challengeBuffer = new Uint8Array(32);
      crypto.getRandomValues(challengeBuffer);
      const challenge = Buffer.from(challengeBuffer).toString("base64url");

      const rawAttachment = (body as { attachment?: string }).attachment;
      const attachment =
        rawAttachment === "platform" || rawAttachment === "cross-platform"
          ? rawAttachment
          : undefined;

      const authenticatorSelection: Record<string, unknown> = {
        // Dla passkeys (Touch ID, Windows Hello) residentKey musi być
        // `required`, inaczej macOS zapamiętuje klucz jako zewnętrzny
        // i na logowaniu oferuje wyłącznie „klucz sprzętowy".
        residentKey: attachment === "platform" ? "required" : "preferred",
        requireResidentKey: attachment === "platform",
        userVerification: "required",
      };
      if (attachment) {
        authenticatorSelection.authenticatorAttachment = attachment;
      }

      return createSuccessResponse({
        options: {
          challenge,
          rp: { name: "MyPerformance" },
          user: {
            id: Buffer.from(userId).toString("base64url"),
            name: userName,
            displayName,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          timeout: 60_000,
          attestation: "none",
          authenticatorSelection,
          extensions: { credProps: true },
        },
        challenge,
      });
    }

    if (action === "register") {
      const { credential, label, attachment } = body as {
        credential?: {
          id: string;
          attestationObject: string;
          publicKey?: string;
          transports?: string[];
        };
        label?: string;
        attachment?: "platform" | "cross-platform";
      };

      if (!credential?.id || !credential.attestationObject) {
        throw ApiError.badRequest("Brakuje danych credential");
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
        const existing = (userData.credentials || []).filter(
          (c: any) => c.type === "webauthn",
        );

        if (existing.length >= MAX_WEBAUTHN_KEYS) {
          throw ApiError.conflict(
            `Możesz zarejestrować maksymalnie ${MAX_WEBAUTHN_KEYS} klucze bezpieczeństwa`,
          );
        }

        const credentialIdBase64 = base64urlToBase64(credential.id);
        for (const ex of existing) {
          try {
            const credData = JSON.parse(ex.credentialData || "{}");
            if (
              credData.credentialId === credentialIdBase64 ||
              credData.credentialId === credential.id
            ) {
              throw ApiError.conflict(
                "Ten klucz bezpieczeństwa jest już zarejestrowany",
              );
            }
          } catch (e) {
            if (e instanceof ApiError) throw e;
          }
        }

        // Platform authenticator → wymuszamy transport `internal`, aby
        // Keycloak poprawnie oznaczył credential jako biometryczny (inaczej
        // przeglądarka oferuje tylko tryb „klucz sprzętowy").
        const transports =
          attachment === "platform"
            ? ["internal"]
            : credential.transports && credential.transports.length > 0
              ? credential.transports
              : undefined;

        const webauthnCredential = {
          type: "webauthn",
          userLabel: label || "Klucz bezpieczeństwa",
          credentialData: JSON.stringify({
            credentialId: credentialIdBase64,
            credentialPublicKey: credential.publicKey || "",
            counter: 0,
            aaguid: extractAaguid(credential.attestationObject),
            attestationStatementFormat: "none",
            ...(transports ? { transports } : {}),
            ...(attachment ? { authenticatorAttachment: attachment } : {}),
          }),
          secretData: JSON.stringify({}),
        };

        const updateRes = await keycloak.adminRequest(
          `/users/${userId}`,
          adminToken,
          {
            method: "PUT",
            body: JSON.stringify({
              ...userData,
              credentials: [
                ...(userData.credentials || []),
                webauthnCredential,
              ],
            }),
          },
        );

        if (!updateRes.ok && updateRes.status !== 204) {
          throw ApiError.serviceUnavailable(
            "Nie udało się zarejestrować klucza",
          );
        }
      });

      return createSuccessResponse({ success: true });
    }

    throw ApiError.badRequest("Invalid action");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const accessToken = (session as any).accessToken as string;
    const body = await request.json().catch(() => null);
    const { credentialId, newName } = (body ?? {}) as {
      credentialId?: string;
      newName?: string;
    };
    if (!credentialId || !newName) {
      throw ApiError.badRequest("Missing credentialId or newName");
    }

    await withAdminContext(accessToken, async (adminToken, userId) => {
      const res = await fetch(
        keycloak.getAdminUrl(
          `/users/${userId}/credentials/${credentialId}/userLabel`,
        ),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "text/plain; charset=UTF-8",
          },
          body: newName,
        },
      );
      if (!res.ok) {
        throw ApiError.serviceUnavailable(
          "Nie udało się zmienić nazwy klucza",
        );
      }
    });

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const accessToken = (session as any).accessToken as string;
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get("id");
    if (!credentialId) {
      throw ApiError.badRequest("Missing credential ID");
    }

    // Admin-forced check
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
      if (normalized.includes("WEBAUTHN_REGISTER")) {
        throw new ApiError(
          "FORBIDDEN",
          "Klucz bezpieczeństwa został wymuszony przez administratora i nie może zostać usunięty.",
          403,
          "admin_forced",
        );
      }
    });

    let res = await fetch(
      keycloak.getAccountUrl(`/account/credentials/${credentialId}`),
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!res.ok) {
      res = await withAdminContext(accessToken, (adminToken, userId) =>
        fetch(
          keycloak.getAdminUrl(`/users/${userId}/credentials/${credentialId}`),
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` },
          },
        ),
      );
    }

    if (!res.ok) {
      throw ApiError.serviceUnavailable("Nie udało się usunąć klucza");
    }

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
