import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "geoip" });

export interface GeoRow {
  ip: string;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  region: string | null;
  asn: string | null;
  org: string | null;
  lat: number | null;
  lng: number | null;
  lookedUpAt: string;
  error: string | null;
}

interface IpapiResponse {
  ip?: string;
  country_name?: string;
  country_code?: string;
  city?: string;
  region?: string;
  asn?: string;
  org?: string;
  latitude?: number;
  longitude?: number;
  error?: boolean;
  reason?: string;
}

const TTL_DAYS = 30;
const inFlight = new Map<string, Promise<GeoRow | null>>();

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (/^fe80::/i.test(ip)) return true;
  if (/^fd[0-9a-f]{2}:/i.test(ip)) return true;
  return false;
}

async function readCached(ip: string): Promise<GeoRow | null> {
  return withClient(async (c) => {
    const r = await c.query<{
      ip: string;
      country: string | null;
      country_code: string | null;
      city: string | null;
      region: string | null;
      asn: string | null;
      org: string | null;
      lat: number | null;
      lng: number | null;
      looked_up_at: Date;
      error: string | null;
    }>(
      `SELECT ip, country, country_code, city, region, asn, org, lat, lng, looked_up_at, error
         FROM mp_ip_geo
        WHERE ip = $1
          AND looked_up_at > now() - interval '${TTL_DAYS} days'`,
      [ip],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      ip: row.ip,
      country: row.country,
      countryCode: row.country_code,
      city: row.city,
      region: row.region,
      asn: row.asn,
      org: row.org,
      lat: row.lat,
      lng: row.lng,
      lookedUpAt: row.looked_up_at.toISOString(),
      error: row.error,
    };
  });
}

async function fetchAndStore(ip: string): Promise<GeoRow | null> {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "myperformance-dashboard/1.0" },
    });
    if (!res.ok) {
      throw new Error(`ipapi ${res.status}`);
    }
    const j = (await res.json()) as IpapiResponse;
    if (j.error) throw new Error(j.reason ?? "ipapi error");
    const row: GeoRow = {
      ip,
      country: j.country_name ?? null,
      countryCode: j.country_code ?? null,
      city: j.city ?? null,
      region: j.region ?? null,
      asn: j.asn ?? null,
      org: j.org ?? null,
      lat: typeof j.latitude === "number" ? j.latitude : null,
      lng: typeof j.longitude === "number" ? j.longitude : null,
      lookedUpAt: new Date().toISOString(),
      error: null,
    };
    await withClient((c) =>
      c.query(
        `INSERT INTO mp_ip_geo
           (ip, country, country_code, city, region, asn, org, lat, lng, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)
         ON CONFLICT (ip) DO UPDATE SET
           country = EXCLUDED.country,
           country_code = EXCLUDED.country_code,
           city = EXCLUDED.city,
           region = EXCLUDED.region,
           asn = EXCLUDED.asn,
           org = EXCLUDED.org,
           lat = EXCLUDED.lat,
           lng = EXCLUDED.lng,
           looked_up_at = now(),
           error = NULL`,
        [
          ip,
          row.country,
          row.countryCode,
          row.city,
          row.region,
          row.asn,
          row.org,
          row.lat,
          row.lng,
        ],
      ),
    );
    return row;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("geo lookup failed", { ip, err: msg });
    // Cache błąd na krótko (24h) żeby nie hammerować ipapi
    await withClient((c) =>
      c.query(
        `INSERT INTO mp_ip_geo (ip, error, looked_up_at)
         VALUES ($1, $2, now() - interval '${TTL_DAYS - 1} days')
         ON CONFLICT (ip) DO UPDATE SET error = EXCLUDED.error, looked_up_at = EXCLUDED.looked_up_at`,
        [ip, msg.slice(0, 200)],
      ),
    ).catch(() => null);
    return null;
  }
}

export async function lookupIp(ip: string): Promise<GeoRow | null> {
  if (isPrivateIp(ip)) return null;
  const cached = await readCached(ip).catch(() => null);
  if (cached && !cached.error) return cached;
  const inflight = inFlight.get(ip);
  if (inflight) return inflight;
  const p = fetchAndStore(ip).finally(() => inFlight.delete(ip));
  inFlight.set(ip, p);
  return p;
}

export async function lookupIps(ips: string[]): Promise<Map<string, GeoRow>> {
  const map = new Map<string, GeoRow>();
  // Batch z DB (jedno query)
  const dedup = Array.from(new Set(ips.filter((ip) => !isPrivateIp(ip))));
  if (dedup.length === 0) return map;
  await withClient(async (c) => {
    const r = await c.query<{
      ip: string;
      country: string | null;
      country_code: string | null;
      city: string | null;
      region: string | null;
      asn: string | null;
      org: string | null;
      lat: number | null;
      lng: number | null;
      looked_up_at: Date;
      error: string | null;
    }>(
      `SELECT ip, country, country_code, city, region, asn, org, lat, lng, looked_up_at, error
         FROM mp_ip_geo
        WHERE ip = ANY($1::text[])
          AND looked_up_at > now() - interval '${TTL_DAYS} days'`,
      [dedup],
    );
    for (const row of r.rows) {
      if (!row.error) {
        map.set(row.ip, {
          ip: row.ip,
          country: row.country,
          countryCode: row.country_code,
          city: row.city,
          region: row.region,
          asn: row.asn,
          org: row.org,
          lat: row.lat,
          lng: row.lng,
          lookedUpAt: row.looked_up_at.toISOString(),
          error: null,
        });
      }
    }
  });
  // Pobierz brakujące w tle (max 5 równolegle, żeby nie zarzucić ipapi)
  const missing = dedup.filter((ip) => !map.has(ip));
  const limit = 5;
  for (let i = 0; i < missing.length; i += limit) {
    const batch = missing.slice(i, i + limit);
    const rows = await Promise.all(batch.map((ip) => lookupIp(ip)));
    for (let j = 0; j < batch.length; j++) {
      const r = rows[j];
      if (r) map.set(batch[j]!, r);
    }
  }
  return map;
}
