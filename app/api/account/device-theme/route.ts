export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiError, handleApiError } from "@/lib/api-utils";
import { withClient } from "@/lib/db";
import { parseDeviceCookie, DEVICE_COOKIE_NAME } from "@/lib/security/devices";
import { getClientIp } from "@/lib/rate-limit";

/**
 * Per-device theme persistence. Klucz = mp_did device id (HMAC-signed cookie).
 * Cookie `mp_theme` (channel client → server) jest zsynchronizowany z DB
 * żeby SSR mógł renderować właściwy theme od pierwszego paintu, niezależnie
 * od urządzenia z którego user się loguje.
 */

interface PostBody {
  theme?: "light" | "dark";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as PostBody | null;
    const theme = body?.theme;
    if (theme !== "light" && theme !== "dark") {
      throw ApiError.badRequest("theme must be 'light' or 'dark'");
    }

    const cookieStore = await cookies();
    const deviceCookie = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
    const deviceId = parseDeviceCookie(deviceCookie);
    if (!deviceId) {
      // Brak fingerprint cookie — middleware go ustawi przy następnym
      // requeście. Mimo to zwracamy ok, bo localStorage po stronie
      // klienta i tak działa.
      return NextResponse.json({ data: { ok: true, persisted: false } });
    }

    const ip = getClientIp(request);
    await withClient((c) =>
      c.query(
        `INSERT INTO mp_device_theme (device_id, theme, ip, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (device_id) DO UPDATE SET
           theme = EXCLUDED.theme,
           ip = EXCLUDED.ip,
           updated_at = now()`,
        [deviceId, theme, ip],
      ),
    );

    return NextResponse.json({ data: { ok: true, persisted: true } });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const deviceCookie = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
    const deviceId = parseDeviceCookie(deviceCookie);
    if (!deviceId) {
      return NextResponse.json({ data: { theme: null } });
    }
    const r = await withClient((c) =>
      c.query<{ theme: string }>(
        `SELECT theme FROM mp_device_theme WHERE device_id = $1`,
        [deviceId],
      ),
    );
    return NextResponse.json({ data: { theme: r.rows[0]?.theme ?? null } });
  } catch (err) {
    return handleApiError(err);
  }
}
