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
import {
  consumeChallenge,
  storeChallenge,
} from "@/lib/security/webauthn-challenges";
import { log } from "@/lib/logger";

const logger = log.child({ module: "webauthn-route" });

const MAX_WEBAUTHN_KEYS = 2;

function base64urlToBase64(value: string): string {
  return value.replace(/-/g, "+").replace(/_/g, "/");
}

interface KeycloakCredentialMetadata {
  credential?: {
    id?: string;
    userLabel?: string;
    createdDate?: number;
  };
}

interface KeycloakCredentialEntry {
  type?: string;
  userCredentialMetadatas?: KeycloakCredentialMetadata[];
}

async function fetchAccountCredentials(
  accessToken: string,
): Promise<KeycloakCredentialEntry[]> {
  const res = await fetch(keycloak.getAccountUrl("/account/credentials"), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    logger.warn("KC Account API /credentials failed", {
      status: res.status,
      // Pomocne gdy diagnozujemy "klucz jest w KC ale UI nie pokazuje" —
      // 401 = session lost / invalid token, 403 = brak permission, 5xx = KC down.
    });
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? (data as KeycloakCredentialEntry[]) : [];
}

/**
 * Fallback: jeśli Account API zwraca puste / nie ma webauthn entry, pobieramy
 * credentials usera przez Admin API (service-account). KC Account API
 * w niektórych wersjach 26.x nie expose'uje webauthn-passwordless w
 * /account/credentials nawet jeśli credential istnieje — Admin API to source
 * of truth.
 */
async function fetchAdminCredentials(
  accessToken: string,
): Promise<Array<{ id: string; type: string; userLabel?: string; createdDate?: number }>> {
  try {
    const userId = await keycloak.getUserIdFromToken(accessToken);
    const adminToken = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(
      `/users/${userId}/credentials`,
      adminToken,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const accessToken = session.accessToken ?? "";
    const credentials = await fetchAccountCredentials(accessToken);
    // KC zapisuje passkey/security keys w 2 osobnych types:
    //   webauthn               — security key jako 2FA (po hasle)
    //   webauthn-passwordless  — passkey jako primary auth (pierwszy factor)
    const buckets = credentials.filter(
      (c) => c?.type === "webauthn" || c?.type === "webauthn-passwordless",
    );
    let keys = buckets.flatMap((bucket) =>
      (bucket.userCredentialMetadatas || []).map((m) => ({
        id: m.credential?.id,
        credentialId: m.credential?.id,
        label: m.credential?.userLabel || "Klucz bezpieczeństwa",
        createdDate: m.credential?.createdDate,
        kind: bucket.type === "webauthn-passwordless" ? "passkey" : "security-key",
      })),
    );

    // Fallback: KC Account API w niektórych wersjach 26.x nie zwraca
    // webauthn-passwordless w /account/credentials. Jeśli nasz Account API
    // pokazuje 0 webauthn keys ALE Admin API ma — bierzemy z Admin.
    if (keys.length === 0) {
      const adminCreds = await fetchAdminCredentials(accessToken);
      const adminWebauthn = adminCreds.filter(
        (c) => c.type === "webauthn" || c.type === "webauthn-passwordless",
      );
      if (adminWebauthn.length > 0) {
        keys = adminWebauthn.map((c) => ({
          id: c.id,
          credentialId: c.id,
          label: c.userLabel || "Klucz bezpieczeństwa",
          createdDate: c.createdDate,
          kind: c.type === "webauthn-passwordless" ? "passkey" : "security-key",
        }));
        logger.info("webauthn keys via Admin API fallback", {
          count: adminWebauthn.length,
        });
      }
    }

    return createSuccessResponse({ keys, hasWebAuthn: keys.length > 0 });
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
    const { action } = body as { action?: string };

    if (action === "get-options") {
      const userId = await keycloak.getUserIdFromToken(accessToken);

      const profileRes = await fetch(keycloak.getAccountUrl("/account"), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      let userName = session.user?.email || "user";
      let displayName = session.user?.name || userName;

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

      // Persist challenge → walidujemy go przy `register` żeby nie dało się
      // wysłać podstawionego clientDataJSON.challenge (replay protection).
      await storeChallenge({
        challenge,
        userId,
        purpose: `register-${attachment ?? "any"}`,
        ttlSeconds: 60,
      });

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
          clientDataJSON?: string;
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
        // Replay protection: walidujemy challenge wystawiony w get-options.
        // ClientDataJSON zawiera challenge wybrany przez przeglądarkę przy
        // navigator.credentials.create — musi się zgadzać z tym który
        // wystawiliśmy 60s wcześniej i jeszcze nie skonsumowali.
        if (credential.clientDataJSON) {
          let challengeFromClient: string | null = null;
          let originFromClient: string | null = null;
          let typeFromClient: string | null = null;
          try {
            const decoded = Buffer.from(
              credential.clientDataJSON,
              "base64",
            ).toString("utf8");
            const parsed = JSON.parse(decoded) as {
              challenge?: string;
              origin?: string;
              type?: string;
            };
            challengeFromClient = parsed.challenge ?? null;
            originFromClient = parsed.origin ?? null;
            typeFromClient = parsed.type ?? null;
          } catch {
            throw ApiError.badRequest("Nieprawidłowy clientDataJSON");
          }
          if (typeFromClient !== "webauthn.create") {
            throw ApiError.badRequest(
              `Niepoprawny typ clientData: ${typeFromClient}`,
            );
          }
          // Origin musi się zgadzać z naszym dashboardem (RP origin)
          const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(
            /\/$/,
            "",
          );
          if (
            expectedOrigin &&
            originFromClient &&
            originFromClient.replace(/\/$/, "") !== expectedOrigin
          ) {
            throw ApiError.badRequest(
              `Nieprawidłowy origin: ${originFromClient}`,
            );
          }
          if (!challengeFromClient) {
            throw ApiError.badRequest("Brak challenge w clientData");
          }
          const ok = await consumeChallenge({
            challenge: challengeFromClient,
            userId,
            purpose: `register-${attachment ?? "any"}`,
          });
          if (!ok) {
            throw ApiError.unauthorized(
              "Challenge wygasł lub został już wykorzystany — odśwież i spróbuj ponownie",
            );
          }
        }

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
        const existing = ((userData.credentials || []) as Array<{
          type?: string;
          credentialData?: string;
        }>).filter(
          (c) => c.type === "webauthn" || c.type === "webauthn-passwordless",
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
          logger.warn("attestationObject CBOR parse failed", {
            userId,
            err: err instanceof Error ? err.message : String(err),
          });
          // NIE zwracamy szczegółów błędu CBOR do klienta — daje to attacker
          // info o naszym parserze. Generic msg + log full detail.
          throw ApiError.badRequest("Nieprawidłowy attestationObject");
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
          logger.error("KC PUT /users failed during webauthn register", {
            userId,
            status: updateRes.status,
            // Trzymamy full details w server log, ale nie wystawiamy ich
            // w response do klienta — może wyciec internal KC error info.
            details: details.slice(0, 500),
          });
          throw new ApiError(
            "SERVICE_UNAVAILABLE",
            "Keycloak odrzucił credential — użyj opcji 'Wymuszone akcje → Rejestracja klucza passkey' z panelu admina (natywny flow Keycloaka).",
            updateRes.status,
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

    const accessToken = session.accessToken ?? "";
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

    const accessToken = session.accessToken ?? "";
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
