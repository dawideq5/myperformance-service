export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Wave 21 / Faza 1G — panel-side photo relay z auth Bearer injection.
 *
 * Problem: zdjęcia serwisowe są chronione przez `getPanelUserFromRequest`
 * na dashboardzie (`/api/public/service-photos/:id`) — wymaga Bearer w
 * nagłówku Authorization. Browser jednak nie przesyła Bearer dla
 * `<img src>` (tylko cookies). Skutek: 401 + znaki zapytania w UI.
 *
 * Fix: ten endpoint relayuje GET przez panel-side session (NextAuth
 * cookie → access token), dorzuca Bearer i forwarduje do dashboardu
 * jako stream. Browser widzi same-origin URL `/api/relay/photo/<id>`
 * bez kombinacji z auth.
 *
 * Forwardowane query params: `width`, `height`, `fit`, `quality` —
 * obsługiwane przez Directus assets transformation.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

const FORWARD_QUERY = ["width", "height", "fit", "quality"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  const { id } = await params;
  const safeId = id.replace(/[^A-Za-z0-9._-]/g, "");
  if (!safeId || safeId !== id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const reqUrl = new URL(req.url);
  const qs = new URLSearchParams();
  for (const k of FORWARD_QUERY) {
    const v = reqUrl.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  const upstreamUrl = `${DASHBOARD_URL}/api/public/service-photos/${encodeURIComponent(
    safeId,
  )}${qs.toString() ? `?${qs.toString()}` : ""}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }
    const headers = new Headers();
    const ct = upstream.headers.get("content-type") ?? "image/jpeg";
    headers.set("content-type", ct);
    const cl = upstream.headers.get("content-length");
    if (cl) headers.set("content-length", cl);
    headers.set("cache-control", "private, max-age=300");
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json(
      { error: "upstream_failed", detail: String(err) },
      { status: 502 },
    );
  }
}
