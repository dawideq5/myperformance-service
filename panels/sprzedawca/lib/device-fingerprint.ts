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
 * Extract the cert serial number forwarded by Traefik.
 *
 * Traefik `passTLSClientCert` renders the info header as a semicolon-delimited
 * list of `key=value` pairs. Values may be:
 *   - quoted:  `SerialNumber="1234ABCD"` (common in info form)
 *   - bare:    `SerialNumber=1234ABCD`   (older versions)
 *   - URL-encoded on newer Traefik releases
 *
 * Fallback chain:
 *   1. Parse SerialNumber out of `x-forwarded-tls-client-cert-info`.
 *   2. If missing, try extracting it from the raw PEM in
 *      `x-forwarded-tls-client-cert` by locating the cert's DER serial bytes.
 *
 * Returns a lowercase hex string without separators (step-ca uses decimal
 * serials, so do one more layer of normalization at the comparison site).
 */
export function extractCertSerial(headers: Headers): string | null {
  const info = headers.get("x-forwarded-tls-client-cert-info");
  if (info) {
    const decoded = safeDecode(info);
    const quoted = decoded.match(/SerialNumber\s*=\s*"([^"]+)"/i);
    if (quoted) return normaliseSerial(quoted[1]);
    const bare = decoded.match(/SerialNumber\s*=\s*([A-Za-z0-9:_-]+)/i);
    if (bare) return normaliseSerial(bare[1]);
  }

  const pem = headers.get("x-forwarded-tls-client-cert");
  if (pem) {
    const serial = serialFromPem(safeDecode(pem));
    if (serial) return serial;
  }

  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normaliseSerial(raw: string): string {
  return raw.trim().replace(/[:\s]/g, "").toLowerCase();
}

/**
 * Pull the serial number out of a PEM-encoded certificate. Traefik's `pem`
 * option strips BEGIN/END markers and replaces newlines with `=`, so we
 * restore them first. We parse the DER TBSCertificate header to reach the
 * serial-number INTEGER (ASN.1 tag 0x02).
 */
function serialFromPem(pem: string): string | null {
  try {
    const normalised = pem
      .replace(/=([A-Za-z0-9+/=])/g, "\n$1") // Traefik uses `=` separator in "flat" mode
      .replace(/-----BEGIN [A-Z ]+-----/g, "")
      .replace(/-----END [A-Z ]+-----/g, "")
      .replace(/\s+/g, "");
    const bytes = Uint8Array.from(atob(normalised), (c) => c.charCodeAt(0));

    // DER: SEQUENCE (Cert) → SEQUENCE (TBSCertificate) → [0] version (optional) →
    //                         INTEGER (serialNumber)
    let offset = 0;
    if (bytes[offset++] !== 0x30) return null; // outer SEQUENCE
    offset += skipLength(bytes, offset);
    if (bytes[offset++] !== 0x30) return null; // TBSCertificate SEQUENCE
    offset += skipLength(bytes, offset);
    // Optional version tag [0] EXPLICIT
    if (bytes[offset] === 0xa0) {
      offset += 1;
      const len = readLength(bytes, offset);
      offset += len.header + len.value;
    }
    if (bytes[offset++] !== 0x02) return null; // serialNumber INTEGER
    const serialLen = readLength(bytes, offset);
    offset += serialLen.header;
    const serialBytes = bytes.slice(offset, offset + serialLen.value);
    let hex = "";
    for (const b of serialBytes) hex += b.toString(16).padStart(2, "0");
    return normaliseSerial(hex);
  } catch {
    return null;
  }
}

function skipLength(bytes: Uint8Array, offset: number): number {
  const first = bytes[offset];
  if (first < 0x80) return 1;
  return 1 + (first & 0x7f);
}

function readLength(
  bytes: Uint8Array,
  offset: number,
): { header: number; value: number } {
  const first = bytes[offset];
  if (first < 0x80) return { header: 1, value: first };
  const n = first & 0x7f;
  let value = 0;
  for (let i = 0; i < n; i++) value = (value << 8) | bytes[offset + 1 + i];
  return { header: 1 + n, value };
}
