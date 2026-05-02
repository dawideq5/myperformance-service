import { createHmac, timingSafeEqual } from "crypto";
import { getOptionalEnv } from "@/lib/env";

/**
 * Customer-portal signed-JWT-like cookie ("compact tokens"). Format:
 *   base64url(payloadJson) + "." + base64url(hmacSha256)
 *
 * Nie używamy pełnego JWT (header alg etc.) — minimalna struktura wystarczy
 * dla cookie scoped do email + exp. Sekret z env CUSTOMER_PORTAL_OTP_SECRET.
 *
 * Cookie ustawiane przez `/api/customer-portal/auth/verify-otp` na 24h, scope
 * Domain=.zlecenieserwisowe.pl, HttpOnly, Secure, SameSite=Lax.
 */

export interface OtpSessionPayload {
  /** Email lower-case. */
  email: string;
  /** Unix epoch sec — issuedAt. */
  iat: number;
  /** Unix epoch sec — expiresAt. */
  exp: number;
}

export const OTP_COOKIE_NAME = "customer_portal_otp_session";

function getSecret(): Buffer {
  const raw =
    getOptionalEnv("CUSTOMER_PORTAL_OTP_SECRET") ||
    getOptionalEnv("NEXTAUTH_SECRET") ||
    "";
  if (!raw || raw.length < 16) {
    throw new Error(
      "CUSTOMER_PORTAL_OTP_SECRET (lub NEXTAUTH_SECRET) musi być ustawiony, min 16 znaków.",
    );
  }
  return Buffer.from(raw, "utf8");
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signOtpSession(email: string, ttlSeconds = 24 * 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: OtpSessionPayload = {
    email: email.trim().toLowerCase(),
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

export function verifyOtpSession(token: string): OtpSessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;
  let expectedSig: Buffer;
  try {
    expectedSig = createHmac("sha256", getSecret())
      .update(payloadB64)
      .digest();
  } catch {
    return null;
  }
  const givenSig = b64urlDecode(sigB64);
  if (
    expectedSig.length !== givenSig.length ||
    !timingSafeEqual(expectedSig, givenSig)
  ) {
    return null;
  }
  let payload: OtpSessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof payload?.email !== "string" ||
    typeof payload?.exp !== "number" ||
    typeof payload?.iat !== "number"
  ) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** Buduje header `Set-Cookie` z konfiguracją prod/dev. */
export function buildSessionCookie(token: string, ttlSeconds = 24 * 3600): string {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${OTP_COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${ttlSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProd) {
    parts.push("Secure");
    // Allow cookie to flow across subdomains of zlecenieserwisowe.pl —
    // dashboard sets cookie via cross-origin XHR (withCredentials), front-end
    // on https://zlecenieserwisowe.pl reads/sends it back automatically.
    parts.push("Domain=.zlecenieserwisowe.pl");
  }
  return parts.join("; ");
}

export function buildClearSessionCookie(): string {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${OTP_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProd) {
    parts.push("Secure");
    parts.push("Domain=.zlecenieserwisowe.pl");
  }
  return parts.join("; ");
}
