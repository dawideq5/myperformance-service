/**
 * Shared device-fingerprint helpers. Stay isomorphic (Web Crypto) so this can
 * run in Next.js edge middleware as well as Node-backed API routes. Mirror of
 * /lib/device-fingerprint.ts in the dashboard — keep them in sync.
 */
export interface DeviceFingerprintComponents {
  userAgent: string;
  platform: string;
  browserBrand: string;
  acceptLanguage: string;
  mobile: string;
}

function readHeader(headers: Headers, name: string): string {
  return (headers.get(name) ?? "").trim().toLowerCase();
}

export function extractFingerprintComponents(
  headers: Headers,
): DeviceFingerprintComponents {
  return {
    userAgent: readHeader(headers, "user-agent"),
    platform: readHeader(headers, "sec-ch-ua-platform").replace(/"/g, ""),
    browserBrand: readHeader(headers, "sec-ch-ua").replace(/"/g, ""),
    acceptLanguage:
      readHeader(headers, "accept-language").split(",")[0]?.trim() ?? "",
    mobile: readHeader(headers, "sec-ch-ua-mobile").replace(/"/g, ""),
  };
}

/**
 * Traefik's passTLSClientCert middleware exposes certificate metadata via
 * `X-Forwarded-Tls-Client-Cert-Info`: a semicolon-delimited list of
 * `key="value"` pairs. We only need `SerialNumber`.
 */
export function extractCertSerial(headers: Headers): string | null {
  const raw = headers.get("x-forwarded-tls-client-cert-info");
  if (!raw) return null;
  const match = raw.match(/SerialNumber="([^"]+)"/i);
  return match ? match[1] : null;
}
