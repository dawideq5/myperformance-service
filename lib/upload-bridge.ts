import { createHmac, timingSafeEqual } from "crypto";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env";
import type { ServicePhotoStage } from "@/lib/service-photos";

/**
 * Upload-bridge tokens — stateless HMAC-signed handles that the panel issues
 * to mobile uploaders. The token carries the bound (serviceId, stage,
 * uploadedByEmail) and an explicit expiry so the upload-bridge subdomain can
 * accept POSTs without any session — token is the credential.
 *
 * Format: `<base64url(payload-json)>.<base64url(hmac-sha256)>`
 *
 * Why HMAC, not JWT — keeps the dependency footprint zero and the verification
 * trivially auditable. We do not need RS256/audience/issuer fields here.
 */

const BRIDGE_BASE_URL =
  getOptionalEnv("UPLOAD_BRIDGE_URL") || "https://upload.myperformance.pl";

export interface UploadBridgeTokenPayload {
  /** mp_services.id this token grants upload access to. */
  serviceId: string;
  /** Stage classification applied to every photo uploaded via this token. */
  stage: ServicePhotoStage;
  /** Email of the panel user who issued the token (audit trail). */
  uploadedByEmail: string;
  /** Display ticket number (denormalised — used by the mobile UI header). */
  ticketNumber?: string | null;
  /** Issued-at unix-ms. */
  iat: number;
  /** Expires-at unix-ms. */
  exp: number;
  /** Random nonce so identical (service, stage, email, exp) payloads still differ. */
  nonce: string;
}

function b64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(input: string): Buffer {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function getSecret(): string {
  return getRequiredEnv("UPLOAD_BRIDGE_SECRET");
}

export function signUploadToken(
  payload: Omit<UploadBridgeTokenPayload, "iat" | "exp" | "nonce"> & {
    /** Lifetime in ms; defaults to 30 minutes. */
    ttlMs?: number;
    iat?: number;
  },
): { token: string; expiresAt: string; iat: number; exp: number } {
  const secret = getSecret();
  const now = payload.iat ?? Date.now();
  const ttl = payload.ttlMs ?? 30 * 60_000;
  const exp = now + ttl;
  const nonce = b64url(
    Buffer.from(
      `${Math.random().toString(36).slice(2, 10)}${now.toString(36)}`,
    ),
  );
  const fullPayload: UploadBridgeTokenPayload = {
    serviceId: payload.serviceId,
    stage: payload.stage,
    uploadedByEmail: payload.uploadedByEmail,
    ticketNumber: payload.ticketNumber ?? null,
    iat: now,
    exp,
    nonce,
  };
  const payloadJson = JSON.stringify(fullPayload);
  const payloadB64 = b64url(Buffer.from(payloadJson, "utf8"));
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = b64url(sig);
  return {
    token: `${payloadB64}.${sigB64}`,
    expiresAt: new Date(exp).toISOString(),
    iat: now,
    exp,
  };
}

export type UploadBridgeVerifyResult =
  | { valid: true; payload: UploadBridgeTokenPayload }
  | { valid: false; reason: string };

export function verifyUploadToken(
  token: string,
  now: number = Date.now(),
): UploadBridgeVerifyResult {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, reason: "Niepoprawny token." };
  }
  const [payloadB64, sigB64] = token.split(".", 2);
  if (!payloadB64 || !sigB64) {
    return { valid: false, reason: "Niepoprawny token." };
  }
  const secret = getSecret();
  const expectedSig = createHmac("sha256", secret)
    .update(payloadB64)
    .digest();
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigB64);
  } catch {
    return { valid: false, reason: "Niepoprawny podpis tokenu." };
  }
  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(providedSig, expectedSig)
  ) {
    return { valid: false, reason: "Niepoprawny podpis tokenu." };
  }
  let payload: UploadBridgeTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { valid: false, reason: "Uszkodzony token." };
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !payload.serviceId ||
    !payload.stage ||
    !payload.uploadedByEmail ||
    typeof payload.exp !== "number"
  ) {
    return { valid: false, reason: "Niepełny token." };
  }
  if (payload.exp <= now) {
    return { valid: false, reason: "Token wygasł." };
  }
  return { valid: true, payload };
}

export function getUploadBridgeBaseUrl(): string {
  return BRIDGE_BASE_URL.replace(/\/$/, "");
}

export function buildUploadBridgeUrl(token: string): string {
  return `${getUploadBridgeBaseUrl()}/u/${encodeURIComponent(token)}`;
}
