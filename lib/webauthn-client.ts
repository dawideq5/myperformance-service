/**
 * Browser-side helpers for WebAuthn registration. Keycloak stores credentials
 * in its own internal format, so we only need to forward the encoded
 * attestation/clientData buffers — no verification on the client.
 */

function bufToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBuf(b64url: string): ArrayBuffer {
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export type WebAuthnAttachment = "platform" | "cross-platform";

export interface EnrollInput {
  challenge: string;
  rpName: string;
  rpId?: string;
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { alg: number; type: string }[];
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: { id: string; type?: string }[];
}

export interface EnrollResult {
  id: string;
  attestationObject: string;
  clientDataJSON: string;
  publicKey?: string;
  transports?: string[];
  /**
   * Reported by `credential.response.getPublicKeyAlgorithm()` when available —
   * useful for telemetry but not required by Keycloak.
   */
  publicKeyAlgorithm?: number;
}

export async function enrollWebAuthnCredential(
  input: EnrollInput,
): Promise<EnrollResult> {
  if (typeof window === "undefined" || !("credentials" in navigator)) {
    throw new Error("WebAuthn nie jest dostępne w tej przeglądarce");
  }

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToBuf(input.challenge),
    rp: input.rpId ? { name: input.rpName, id: input.rpId } : { name: input.rpName },
    user: {
      id: base64UrlToBuf(input.user.id),
      name: input.user.name,
      displayName: input.user.displayName,
    },
    pubKeyCredParams: input.pubKeyCredParams as PublicKeyCredentialParameters[],
    timeout: input.timeout ?? 60000,
    attestation: input.attestation ?? "none",
    authenticatorSelection: input.authenticatorSelection,
    excludeCredentials: input.excludeCredentials?.map((c) => ({
      id: base64UrlToBuf(c.id),
      type: (c.type ?? "public-key") as PublicKeyCredentialType,
    })),
  };

  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Anulowano rejestrację klucza");

  const response = credential.response as AuthenticatorAttestationResponse;
  const pubKey =
    typeof response.getPublicKey === "function"
      ? response.getPublicKey()
      : null;
  const transports =
    typeof response.getTransports === "function"
      ? response.getTransports()
      : undefined;
  const publicKeyAlgorithm =
    typeof response.getPublicKeyAlgorithm === "function"
      ? response.getPublicKeyAlgorithm()
      : undefined;

  return {
    id: bufToBase64Url(credential.rawId),
    attestationObject: bufToBase64Url(response.attestationObject),
    clientDataJSON: bufToBase64Url(response.clientDataJSON),
    publicKey: pubKey ? bufToBase64Url(pubKey) : undefined,
    transports,
    publicKeyAlgorithm: publicKeyAlgorithm ?? undefined,
  };
}
