import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { withClient } from "@/lib/db";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "devices" });

const COOKIE_NAME = "mp_did";
const COOKIE_DOMAIN = ".myperformance.pl";
const COOKIE_MAX_AGE = 365 * 24 * 3600; // 1 rok

function secret(): string {
  const s = getOptionalEnv("DEVICE_COOKIE_SECRET").trim();
  if (s.length >= 32) return s;
  // Fallback dev: deterministyczny ale ostrzega
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-device-secret-change-in-prod-min-32-chars";
  }
  throw new Error(
    "DEVICE_COOKIE_SECRET not configured (min 32 chars required in production)",
  );
}

function sign(deviceId: string): string {
  return createHmac("sha256", secret()).update(deviceId).digest("base64url");
}

/** Cookie value: `<uuid>.<sig>`. Walidujemy timing-safe. */
export function parseDeviceCookie(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 36) return null;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = sign(id);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return id;
}

export function buildDeviceCookie(deviceId: string): string {
  const value = `${deviceId}.${sign(deviceId)}`;
  return [
    `${COOKIE_NAME}=${value}`,
    `Domain=${COOKIE_DOMAIN}`,
    `Path=/`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
  ].join("; ");
}

export const DEVICE_COOKIE_NAME = COOKIE_NAME;

/** Tworzy nowy device_id (UUID v4). */
export function newDeviceId(): string {
  return randomUUID();
}

function uaHash(ua: string | null): string | null {
  if (!ua) return null;
  return createHash("sha256").update(ua).digest("hex").slice(0, 16);
}

/**
 * In-memory dedupe — nie wstawiamy sighting'ów częściej niż raz na 5 min
 * dla tego samego (device, user, path-prefix). Drobne ryzyko utraty
 * sightings przy restarcie kontenera, ale chroni DB przed spam'em.
 */
const dedupe = new Map<string, number>();
const DEDUPE_TTL_MS = 5 * 60_000;

setInterval(() => {
  const cutoff = Date.now() - DEDUPE_TTL_MS;
  for (const [k, v] of dedupe) {
    if (v < cutoff) dedupe.delete(k);
  }
}, 5 * 60_000).unref?.();

export interface SightingInput {
  deviceId: string;
  userId?: string | null;
  userEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  path: string;
  requestId?: string | null;
}

/**
 * Zapisuje sighting do mp_device_sightings + bumpuje last_seen w mp_devices.
 * In-memory dedupe na 5 min per (device, user, path-prefix).
 * Jeśli `mp_devices` nie ma tego id — tworzy.
 */
export async function recordSighting(s: SightingInput): Promise<void> {
  const pathBucket = s.path.split("/").slice(0, 3).join("/"); // /api/admin/* → /api/admin
  const key = `${s.deviceId}|${s.userId ?? "_"}|${pathBucket}`;
  const last = dedupe.get(key);
  const now = Date.now();
  if (last && now - last < DEDUPE_TTL_MS) return;
  dedupe.set(key, now);

  let isNewForUser = false;
  try {
    await withClient(async (c) => {
      // Upsert device
      await c.query(
        `INSERT INTO mp_devices (id, user_agent, last_seen)
         VALUES ($1, $2, now())
         ON CONFLICT (id) DO UPDATE SET
           last_seen = now(),
           user_agent = COALESCE(EXCLUDED.user_agent, mp_devices.user_agent)`,
        [s.deviceId, s.userAgent ?? null],
      );
      // Sprawdź czy to pierwsza para (deviceId, userId) — wykrycie nowego
      // urządzenia dla danego usera (notify security.login.new_device).
      if (s.userId) {
        const prev = await c.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM mp_device_sightings
            WHERE device_id = $1 AND user_id = $2`,
          [s.deviceId, s.userId],
        );
        isNewForUser = Number(prev.rows[0]?.n ?? "0") === 0;
      }
      // Append sighting
      await c.query(
        `INSERT INTO mp_device_sightings
           (device_id, user_id, user_email, ip, ua_hash, path, request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          s.deviceId,
          s.userId ?? null,
          s.userEmail ?? null,
          s.ip ?? null,
          uaHash(s.userAgent ?? null),
          s.path.slice(0, 200),
          s.requestId ?? null,
        ],
      );
    });
  } catch (err) {
    logger.warn("recordSighting failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  if (isNewForUser && s.userId) {
    // dynamic import — `lib/notify` używa `lib/keycloak` które łączy się
    // z KC tylko gdy faktycznie potrzebne; unikamy circular boot przy starcie.
    void import("@/lib/notify").then(({ notifyUser }) =>
      notifyUser(s.userId!, "security.login.new_device", {
        title: "Nowe urządzenie loguje się na Twoje konto",
        body: `Wykryto pierwsze logowanie z nowego urządzenia (IP: ${s.ip ?? "?"}, UA: ${(s.userAgent ?? "?").slice(0, 80)}). Jeśli to nie Ty — zmień hasło i wyloguj wszystkie sesje.`,
        severity: "warning",
        payload: {
          deviceId: s.deviceId,
          ip: s.ip,
          userAgent: s.userAgent,
        },
        forceEmail: true,
      }),
    );
  }
}

// ── Intel queries (admin) ──────────────────────────────────────────────────

export interface DeviceLink {
  userId: string | null;
  userEmail: string | null;
  ip: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export interface DeviceIntel {
  deviceId: string;
  firstSeen: string;
  lastSeen: string;
  userAgent: string | null;
  totalSightings: number;
  distinctUsers: number;
  distinctIps: number;
  users: Array<{ userId: string | null; email: string | null; count: number; lastSeen: string }>;
  ips: Array<{ ip: string; count: number; lastSeen: string }>;
  riskFlags: string[];
}

export interface UserDevice {
  deviceId: string;
  firstSeen: string;
  lastSeen: string;
  userAgent: string | null;
  sightings: number;
  distinctIps: number;
  topIps: Array<{ ip: string; count: number }>;
}

/**
 * Wszystkie devices na których pojawił się user.
 */
export async function listDevicesForUser(userId: string): Promise<UserDevice[]> {
  return withClient(async (c) => {
    const r = await c.query<{
      device_id: string;
      first_seen: Date;
      last_seen: Date;
      user_agent: string | null;
      sightings: string;
      distinct_ips: string;
    }>(
      `SELECT
         d.id AS device_id,
         d.user_agent,
         MIN(s.seen_at) AS first_seen,
         MAX(s.seen_at) AS last_seen,
         COUNT(*)::text AS sightings,
         COUNT(DISTINCT s.ip)::text AS distinct_ips
       FROM mp_device_sightings s
       JOIN mp_devices d ON d.id = s.device_id
       WHERE s.user_id = $1
       GROUP BY d.id, d.user_agent
       ORDER BY MAX(s.seen_at) DESC`,
      [userId],
    );

    if (r.rows.length === 0) return [];

    const ipsR = await c.query<{
      device_id: string;
      ip: string;
      count: string;
    }>(
      `SELECT device_id, ip, COUNT(*)::text AS count
         FROM mp_device_sightings
        WHERE user_id = $1 AND ip IS NOT NULL
        GROUP BY device_id, ip
        ORDER BY device_id, COUNT(*) DESC`,
      [userId],
    );
    const ipsMap = new Map<string, Array<{ ip: string; count: number }>>();
    for (const row of ipsR.rows) {
      const arr = ipsMap.get(row.device_id) ?? [];
      if (arr.length < 5) arr.push({ ip: row.ip, count: parseInt(row.count, 10) });
      ipsMap.set(row.device_id, arr);
    }

    return r.rows.map((row) => ({
      deviceId: row.device_id,
      firstSeen: row.first_seen.toISOString(),
      lastSeen: row.last_seen.toISOString(),
      userAgent: row.user_agent,
      sightings: parseInt(row.sightings, 10),
      distinctIps: parseInt(row.distinct_ips, 10),
      topIps: ipsMap.get(row.device_id) ?? [],
    }));
  });
}

/**
 * Wszyscy users + IP per device.
 */
export async function getDeviceIntel(deviceId: string): Promise<DeviceIntel | null> {
  return withClient(async (c) => {
    const dr = await c.query<{
      id: string;
      first_seen: Date;
      last_seen: Date;
      user_agent: string | null;
    }>(`SELECT id, first_seen, last_seen, user_agent FROM mp_devices WHERE id = $1`, [
      deviceId,
    ]);
    const dev = dr.rows[0];
    if (!dev) return null;

    const stats = await c.query<{
      total: string;
      distinct_users: string;
      distinct_ips: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(DISTINCT user_id)::text AS distinct_users,
         COUNT(DISTINCT ip)::text AS distinct_ips
       FROM mp_device_sightings WHERE device_id = $1`,
      [deviceId],
    );

    const usersR = await c.query<{
      user_id: string | null;
      user_email: string | null;
      count: string;
      last_seen: Date;
    }>(
      `SELECT user_id, user_email, COUNT(*)::text AS count, MAX(seen_at) AS last_seen
         FROM mp_device_sightings
        WHERE device_id = $1 AND user_id IS NOT NULL
        GROUP BY user_id, user_email
        ORDER BY MAX(seen_at) DESC
        LIMIT 30`,
      [deviceId],
    );
    const ipsR = await c.query<{
      ip: string;
      count: string;
      last_seen: Date;
    }>(
      `SELECT ip, COUNT(*)::text AS count, MAX(seen_at) AS last_seen
         FROM mp_device_sightings
        WHERE device_id = $1 AND ip IS NOT NULL
        GROUP BY ip
        ORDER BY MAX(seen_at) DESC
        LIMIT 20`,
      [deviceId],
    );

    const distinctUsers = parseInt(stats.rows[0]?.distinct_users ?? "0", 10);
    const distinctIps = parseInt(stats.rows[0]?.distinct_ips ?? "0", 10);
    const flags: string[] = [];
    if (distinctUsers >= 5) flags.push(`Współdzielone urządzenie: ${distinctUsers} kont`);
    if (distinctUsers >= 10) flags.push("Możliwy compromise (>10 kont)");
    if (distinctIps >= 10) flags.push(`Mobilne / VPN: ${distinctIps} IP`);

    return {
      deviceId,
      firstSeen: dev.first_seen.toISOString(),
      lastSeen: dev.last_seen.toISOString(),
      userAgent: dev.user_agent,
      totalSightings: parseInt(stats.rows[0]?.total ?? "0", 10),
      distinctUsers,
      distinctIps,
      users: usersR.rows.map((r) => ({
        userId: r.user_id,
        email: r.user_email,
        count: parseInt(r.count, 10),
        lastSeen: r.last_seen.toISOString(),
      })),
      ips: ipsR.rows.map((r) => ({
        ip: r.ip,
        count: parseInt(r.count, 10),
        lastSeen: r.last_seen.toISOString(),
      })),
      riskFlags: flags,
    };
  });
}

/**
 * Globalny przegląd — top devices, suspicious correlations.
 */
export async function listDeviceOverview(args: {
  hours?: number;
  limit?: number;
} = {}): Promise<{
  devices: Array<{
    deviceId: string;
    sightings: number;
    distinctUsers: number;
    distinctIps: number;
    lastSeen: string;
    userAgent: string | null;
  }>;
  suspicious: Array<{
    type: "shared_device" | "user_many_devices" | "device_many_ips";
    description: string;
    severity: "medium" | "high";
    evidence: Record<string, unknown>;
  }>;
}> {
  const hours = Math.min(Math.max(args.hours ?? 168, 1), 720);
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

  return withClient(async (c) => {
    const since = `now() - interval '${hours} hours'`;

    const devices = await c.query<{
      device_id: string;
      sightings: string;
      distinct_users: string;
      distinct_ips: string;
      last_seen: Date;
      user_agent: string | null;
    }>(
      `SELECT
         s.device_id,
         COUNT(*)::text AS sightings,
         COUNT(DISTINCT s.user_id)::text AS distinct_users,
         COUNT(DISTINCT s.ip)::text AS distinct_ips,
         MAX(s.seen_at) AS last_seen,
         d.user_agent
       FROM mp_device_sightings s
       JOIN mp_devices d ON d.id = s.device_id
       WHERE s.seen_at > ${since}
       GROUP BY s.device_id, d.user_agent
       ORDER BY MAX(s.seen_at) DESC
       LIMIT $1`,
      [limit],
    );

    const suspShared = await c.query<{
      device_id: string;
      user_count: string;
      users: string[];
    }>(
      `SELECT device_id, COUNT(DISTINCT user_id)::text AS user_count,
              array_agg(DISTINCT user_email) FILTER (WHERE user_email IS NOT NULL) AS users
         FROM mp_device_sightings
        WHERE seen_at > ${since} AND user_id IS NOT NULL
        GROUP BY device_id
       HAVING COUNT(DISTINCT user_id) >= 4
        ORDER BY COUNT(DISTINCT user_id) DESC
        LIMIT 20`,
    );

    const suspUserMany = await c.query<{
      user_id: string;
      user_email: string | null;
      device_count: string;
    }>(
      `SELECT user_id, MAX(user_email) AS user_email, COUNT(DISTINCT device_id)::text AS device_count
         FROM mp_device_sightings
        WHERE seen_at > ${since} AND user_id IS NOT NULL
        GROUP BY user_id
       HAVING COUNT(DISTINCT device_id) >= 5
        ORDER BY COUNT(DISTINCT device_id) DESC
        LIMIT 20`,
    );

    const suspicious: Array<{
      type: "shared_device" | "user_many_devices" | "device_many_ips";
      description: string;
      severity: "medium" | "high";
      evidence: Record<string, unknown>;
    }> = [];

    for (const r of suspShared.rows) {
      const cnt = parseInt(r.user_count, 10);
      suspicious.push({
        type: "shared_device",
        description: `Urządzenie ${r.device_id.slice(0, 8)}… współdzielone przez ${cnt} kont (${(r.users ?? []).slice(0, 5).join(", ")}${cnt > 5 ? "…" : ""})`,
        severity: cnt >= 8 ? "high" : "medium",
        evidence: { deviceId: r.device_id, users: r.users, userCount: cnt },
      });
    }
    for (const r of suspUserMany.rows) {
      const cnt = parseInt(r.device_count, 10);
      suspicious.push({
        type: "user_many_devices",
        description: `User ${r.user_email ?? r.user_id} korzystał z ${cnt} urządzeń`,
        severity: cnt >= 10 ? "high" : "medium",
        evidence: { userId: r.user_id, userEmail: r.user_email, deviceCount: cnt },
      });
    }

    return {
      devices: devices.rows.map((r) => ({
        deviceId: r.device_id,
        sightings: parseInt(r.sightings, 10),
        distinctUsers: parseInt(r.distinct_users, 10),
        distinctIps: parseInt(r.distinct_ips, 10),
        lastSeen: r.last_seen.toISOString(),
        userAgent: r.user_agent,
      })),
      suspicious,
    };
  });
}
