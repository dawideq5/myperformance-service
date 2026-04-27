export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

/**
 * Relay panel.* audit events do dashboard /api/panel/audit. Klient (PanelHome)
 * nie ma direct dostępu do KC accessToken (NextAuth session client-side
 * zwraca tylko user info), więc panel server-side proxyje request używając
 * accessToken ze swojej NextAuth sesji.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  const body = await req.text();
  try {
    const r = await fetch(`${DASHBOARD_URL}/api/panel/audit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    return NextResponse.json({ ok: r.ok, status: r.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
