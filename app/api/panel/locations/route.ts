export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { keycloak } from "@/lib/keycloak";
import { getActiveLocationsForUser } from "@/lib/certificate-locations";

/**
 * Cross-app endpoint dla paneli (panelsprzedawcy/serwisanta/kierowcy).
 * Panele NIE mają session cookie z dashboardu (różny origin), więc
 * przesyłają KC access token w Bearer header. Walidujemy token przez
 * KC userinfo i zwracamy punkty przypisane do email z tokenu.
 *
 * Używane w panel `/page.tsx` server-side — decyzja 0/1/many locations.
 *
 * Note: nie używamy NextAuth session — to public endpoint accessible
 * cross-origin pod warunkiem ważnego KC access token.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return NextResponse.json(
      { error: "Missing Bearer token" },
      { status: 401 },
    );
  }
  const accessToken = m[1].trim();

  // Walidacja przez KC userinfo — 401 jeśli token expired/invalid.
  let email: string | null = null;
  try {
    const issuer = keycloak.getIssuer();
    const r = await fetch(`${issuer}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 },
      );
    }
    const data = (await r.json()) as { email?: string };
    email = data.email ?? null;
  } catch (err) {
    return NextResponse.json(
      { error: "Token validation failed", detail: String(err) },
      { status: 503 },
    );
  }

  if (!email) {
    return NextResponse.json(
      { locations: [], reason: "no_email" },
      { status: 200 },
    );
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const locations = await getActiveLocationsForUser({ email, panelType: type });

  return NextResponse.json(
    { locations },
    {
      status: 200,
      headers: {
        // CORS dla paneli — panel.myperformance.pl/* może czytać
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
