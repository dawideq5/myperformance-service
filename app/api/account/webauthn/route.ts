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
import { parseAttestationObject } from "@/lib/webauthn-attestation";

const MAX_WEBAUTHN_KEYS = 2;

function base64urlToBase64(value: string): string {
  return value.replace(/-/g, "+").replace(/_/g, "/");
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

      // Explicit RP ID — must match the origin eTLD+1. Without it Safari
      // intermittently rejects registration on subdomains (e.g. www.).
      let rpId: string | undefined;
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        if (appUrl) rpId = new URL(appUrl).hostname;
      } catch {
        /* fall through, browser defaults to origin */
      }

      return createSuccessResponse({
        options: {
          challenge,
          rp: rpId ? { name: "MyPerformance", id: rpId } : { name: "MyPerformance" },
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

        // Wyekstraktuj pola z attestationObject (CBOR) — Keycloak wymaga
        // credentialPublicKey w formacie CBOR-encoded COSE key (base64).
        // Wcześniejsza implementacja wysyłała `credential.publicKey` który
        // jest SPKI DER (z getPublicKey()) lub undefined dla starszych
        // przeglądarek — stąd 503 "Keycloak odrzucił credential".
        let attestation;
        try {
          attestation = parseAttestationObject(credential.attestationObject);
        } catch (err) {
          console.error("[webauthn register] CBOR parse failed:", err);
          throw ApiError.badRequest(
            `Nieprawidłowy attestationObject: ${err instanceof Error ? err.message : "unknown"}`,
          );
        }

        const credentialIdBase64 = attestation.credentialIdBase64;
        for (const ex of existing) {
          try {
            const credData = JSON.parse(ex.credentialData || "{}");
            if (
              credData.credentialId === credentialIdBase64 ||
              credData.credentialId === base64urlToBase64(credential.id)
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
            credentialId: attestation.credentialIdBase64,
            credentialPublicKey: attestation.credentialPublicKeyBase64,
            counter: attestation.signCount,
            aaguid: attestation.aaguid,
            attestationStatementFormat: attestation.fmt,
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
          const details = await updateRes.text().catch(() => "");
          console.error(
            "[webauthn register] KC PUT /users failed:",
            updateRes.status,
            details.slice(0, 500),
          );
          throw new ApiError(
            "SERVICE_UNAVAILABLE",
            "Keycloak odrzucił credential — użyj opcji 'Wymuszone akcje → Rejestracja klucza passkey' z panelu admina (natywny flow Keycloaka).",
            updateRes.status,
            details.slice(0, 500),
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
