/**
 * Stable-ish fingerprint derived purely from request headers. The goal is to
 * detect "my certificate was copied onto another device" scenarios — not to
 * produce a cryptographically unique device ID. All panels (sprzedawca /
 * serwisant / kierowca / dokumenty) and the dashboard must compute
 * fingerprints identically — isomorphic by design so it runs in both the
 * Node.js runtime and the edge middleware runtime.
 */
export interface DeviceFingerprintComponents {
  userAgent: string;
  platform: string;
  browserBrand: string;
  acceptLanguage: string;
  mobile: string;
}

export interface DeviceFingerprint {
  hash: string;
  components: DeviceFingerprintComponents;
}

type HeaderLookup =
  | Headers
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderLookup, name: string): string {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? "";
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const direct = record[name] ?? record[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0] ?? "";
  return direct ?? "";
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

export function extractFingerprintComponents(
  headers: HeaderLookup,
): DeviceFingerprintComponents {
  return {
    userAgent: normalise(readHeader(headers, "user-agent")),
    platform: normalise(readHeader(headers, "sec-ch-ua-platform")).replace(/"/g, ""),
    browserBrand: normalise(readHeader(headers, "sec-ch-ua")).replace(/"/g, ""),
    acceptLanguage:
      normalise(readHeader(headers, "accept-language")).split(",")[0]?.trim() ?? "",
    mobile: normalise(readHeader(headers, "sec-ch-ua-mobile")).replace(/"/g, ""),
  };
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function hashFingerprintComponents(
  components: DeviceFingerprintComponents,
): Promise<string> {
  const canonical = [
    components.userAgent,
    components.platform,
    components.browserBrand,
    components.acceptLanguage,
    components.mobile,
  ].join("|");
  const buf = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return toHex(digest);
}

export async function computeDeviceFingerprint(
  headers: HeaderLookup,
): Promise<DeviceFingerprint> {
  const components = extractFingerprintComponents(headers);
  const hash = await hashFingerprintComponents(components);
  return { hash, components };
}

export interface FingerprintDiff {
  field: keyof DeviceFingerprintComponents;
  before: string;
  after: string;
}

export function diffFingerprints(
  stored: DeviceFingerprintComponents,
  current: DeviceFingerprintComponents,
): FingerprintDiff[] {
  const fields: (keyof DeviceFingerprintComponents)[] = [
    "userAgent",
    "platform",
    "browserBrand",
    "acceptLanguage",
    "mobile",
  ];
  const diffs: FingerprintDiff[] = [];
  for (const field of fields) {
    if (stored[field] !== current[field]) {
      diffs.push({ field, before: stored[field], after: current[field] });
    }
  }
  return diffs;
}

export const FINGERPRINT_FIELD_LABELS: Record<
  keyof DeviceFingerprintComponents,
  string
> = {
  userAgent: "Przeglądarka (User-Agent)",
  platform: "System operacyjny",
  browserBrand: "Rodzaj przeglądarki",
  acceptLanguage: "Preferowany język",
  mobile: "Tryb mobilny",
};
