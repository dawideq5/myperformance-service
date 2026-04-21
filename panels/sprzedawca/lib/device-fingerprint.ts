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
 * Traefik renders `x-forwarded-tls-client-cert-info` as a URL-encoded,
 * semicolon-delimited list of `key="value"` pairs — SerialNumber is given
 * in **decimal** (`SerialNumber="235460867430995380638798850057639372510"`).
 * node-forge (dashboard) parses `cert.serialNumber` as **hex**, so we
 * normalise to lowercase hex without padding on both sides.
 *
 * Fallback chain: info header → raw PEM DER serial.
 */
export function extractCertSerial(headers: Headers): string | null {
  const info = headers.get("x-forwarded-tls-client-cert-info");
  if (info) {
    const decoded = safeDecode(info);
    const quoted = decoded.match(/SerialNumber\s*=\s*"([^"]+)"/i);
    if (quoted) return canonicalSerial(quoted[1]);
    const bare = decoded.match(/SerialNumber\s*=\s*([A-Za-z0-9:_-]+)/i);
    if (bare) return canonicalSerial(bare[1]);
  }

  const pem = headers.get("x-forwarded-tls-client-cert");
  if (pem) {
    const serial = serialFromPem(safeDecode(pem));
    if (serial) return canonicalSerial(serial);
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

/**
 * Canonicalise a serial string to lowercase hex digits only, stripping
 * separators (`:`, whitespace, `_`, `-`). Decimal inputs are converted via
 * BigInt → toString(16). Anything already hex stays hex.
 */
export function canonicalSerial(raw: string): string {
  const cleaned = raw.trim().replace(/[\s:_-]/g, "");
  if (!cleaned) return "";
  if (/^[0-9]+$/.test(cleaned) && cleaned.length > 0) {
    try {
      return BigInt(cleaned).toString(16).toLowerCase();
    } catch {
      return cleaned.toLowerCase();
    }
  }
  return cleaned.toLowerCase();
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

    let offset = 0;
    if (bytes[offset++] !== 0x30) return null;
    offset += skipLength(bytes, offset);
    if (bytes[offset++] !== 0x30) return null;
    offset += skipLength(bytes, offset);
    if (bytes[offset] === 0xa0) {
      offset += 1;
      const len = readLength(bytes, offset);
      offset += len.header + len.value;
    }
    if (bytes[offset++] !== 0x02) return null;
    const serialLen = readLength(bytes, offset);
    offset += serialLen.header;
    const serialBytes = bytes.slice(offset, offset + serialLen.value);
    let hex = "";
    for (const b of serialBytes) hex += b.toString(16).padStart(2, "0");
    return hex;
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
