export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { keycloak } from "@/lib/keycloak";
import { logLocationAction } from "@/lib/location-audit";
import { getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/panel/audit
 * Body: { locationId: string, actionType: string, payload?: object }
 *
 * Cross-app endpoint dla paneli (jak /api/panel/locations) — Bearer KC
 * token validation. Panel wywołuje przy:
 *   - panel.entered: gdy user wejdzie na panelX.myperformance.pl
 *   - panel.location.selected: gdy user wybierze konkretny punkt
 *   - panel.exited: przy logout (best-effort, beforeunload)
 *
 * Public endpoint (cross-origin) — token validation chroni.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return NextResponse.json({ error: "Missing Bearer" }, { status: 401 });
  }
  const accessToken = m[1].trim();

  let userInfo: { sub?: string; email?: string } = {};
  try {
    const issuer = keycloak.getIssuer();
    const r = await fetch(`${issuer}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    userInfo = (await r.json()) as { sub?: string; email?: string };
  } catch {
    return NextResponse.json({ error: "Token check failed" }, { status: 503 });
  }

  let body: { locationId?: string; actionType?: string; payload?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  if (!body.locationId || !body.actionType) {
    return NextResponse.json(
      { error: "locationId + actionType required" },
      { status: 400 },
    );
  }

  await logLocationAction({
    locationId: body.locationId,
    userId: userInfo.sub ?? null,
    userEmail: userInfo.email ?? null,
    actionType: body.actionType,
    payload: body.payload ?? null,
    srcIp: getClientIp(req),
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
