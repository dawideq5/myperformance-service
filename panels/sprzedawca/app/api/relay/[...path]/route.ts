export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

/**
 * Proxy z paneli do dashboard /api/panel/*. Panel-side NextAuth session
 * trzyma KC accessToken; client-side nie ma do niego dostępu, więc
 * proxyjemy server-side pod ścieżkę `${DASHBOARD_URL}/api/panel/<path>`.
 *
 * Ścieżki: tylko whitelisted prefixy (services, claims, protections,
 * pricelist, transport-jobs). Każda inna → 404.
 */
const ALLOWED_PREFIXES = new Set([
  "services",
  "claims",
  "protections",
  "pricelist",
  "transport-jobs",
  "me",
  "repair-types",
  "quote",
  "service-locations",
]);

async function handle(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path?.length) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  if (!ALLOWED_PREFIXES.has(path[0])) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 404 });
  }
  const session = await getServerSession(authOptions);
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const url = new URL(req.url);
  const targetUrl = `${DASHBOARD_URL}/api/panel/${path.join("/")}${url.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  try {
    const r = await fetch(targetUrl, init);
    // Binary-safe: arrayBuffer zamiast text(). text() decoduje jako UTF-8
    // co PSUJE binary streams (PDF, obrazy). Forward bytes nietknięte.
    const ab = await r.arrayBuffer();
    const headers: Record<string, string> = {
      "content-type": r.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    };
    const cd = r.headers.get("content-disposition");
    if (cd) headers["content-disposition"] = cd;
    return new NextResponse(ab, {
      status: r.status,
      headers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "upstream_failed", detail: String(err) },
      { status: 502 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
