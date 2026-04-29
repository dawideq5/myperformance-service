export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

const ALLOWED_PREFIXES = new Set([
  "services",
  "claims",
  "protections",
  "pricelist",
  "transport-jobs",
]);

async function handle(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path?.length || !ALLOWED_PREFIXES.has(path[0])) {
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
    // Binary-safe: arrayBuffer zamiast text() — PDF/obrazy nie tracą bytes.
    const body = await r.arrayBuffer();
    return new NextResponse(body, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
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
export const PATCH = handle;
export const DELETE = handle;
