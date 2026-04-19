import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

/**
 * Helpers for Google Calendar webhook identity + refresh-token storage.
 *
 * - Channel IDs are HMAC-signed so the webhook can verify origin without a DB lookup.
 * - Refresh tokens stored in Keycloak user attributes are AES-256-GCM encrypted at rest.
 *
 * Secret source: WEBHOOK_SIGNING_SECRET (required in prod). Must be >= 32 bytes of entropy.
 */

function getSecret(): Buffer {
  const raw = process.env.WEBHOOK_SIGNING_SECRET?.trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "WEBHOOK_SIGNING_SECRET is missing or shorter than 32 characters",
    );
  }
  // Derive a stable 32-byte key from the secret without requiring hex/base64 format.
  return createHmac("sha256", "myperformance/webhook-key/v1").update(raw).digest();
}

export function isWebhookSecretConfigured(): boolean {
  const raw = process.env.WEBHOOK_SIGNING_SECRET?.trim();
  return Boolean(raw && raw.length >= 32);
}

export function signChannelId(userId: string): string {
  const key = getSecret();
  const nonce = randomBytes(6).toString("hex");
  const payload = `${userId}|${nonce}`;
  const mac = createHmac("sha256", key)
    .update(payload)
    .digest("base64url")
    .slice(0, 32);
  return Buffer.from(`${payload}|${mac}`, "utf-8").toString("base64url");
}

export function verifyChannelId(channelId: string): string | null {
  try {
    const decoded = Buffer.from(channelId, "base64url").toString("utf-8");
    const parts = decoded.split("|");
    if (parts.length !== 3) return null;
    const [userId, nonce, mac] = parts;
    const key = getSecret();
    const expected = createHmac("sha256", key)
      .update(`${userId}|${nonce}`)
      .digest("base64url")
      .slice(0, 32);
    const a = Buffer.from(mac, "utf-8");
    const b = Buffer.from(expected, "utf-8");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
}

export function generateChannelToken(): string {
  return randomBytes(24).toString("base64url");
}

export function encryptSecret(plaintext: string): string {
  const key = getSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Unsupported encrypted payload");
  }
  const key = getSecret();
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ct = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf-8");
}
