export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

const ALLOWED_PANEL_PREFIXES = new Set([
  "services",
  "claims",
  "protections",
  "pricelist",
  "transport-jobs",
  "service-locations",
]);
const ALLOWED_ACCOUNT_PREFIXES = new Set(["inbox", "preferences"]);
// Top-level non-panel mounts that the serwisant UI is allowed to call. Each
// entry maps the segment 1:1 to `/api/<segment>/...` on the dashboard.
const ALLOWED_ROOT_PREFIXES = new Set(["upload-bridge"]);

// Wave 21 Faza 1G — niektóre sub-route'y panelu serwisanta wymagają
// dłuższego timeoutu bo wewnątrz wykonują integracje zewnętrzne (Documenso,
// Chatwoot, Directus uploads). 15s to za mało żeby zdążyć przed cold-start
// upstream'em. 30s daje margines, jednocześnie nie pozwala "wisiącym"
// requestom blokować UI w nieskończoność.
const RELAY_TIMEOUT_MS = 30_000;

async function handle(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path?.length) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  // Routing: account/* → /api/account/*, reszta → /api/panel/*.
  let targetPath: string;
  if (path[0] === "account") {
    if (path.length < 2 || !ALLOWED_ACCOUNT_PREFIXES.has(path[1])) {
      return NextResponse.json({ error: "Path not allowed" }, { status: 404 });
    }
    targetPath = `account/${path.slice(1).join("/")}`;
  } else if (ALLOWED_ROOT_PREFIXES.has(path[0])) {
    // Mounted at /api/<segment>/... directly (not under /api/panel/).
    targetPath = path.join("/");
  } else if (ALLOWED_PANEL_PREFIXES.has(path[0])) {
    targetPath = `panel/${path.join("/")}`;
  } else {
    return NextResponse.json({ error: "Path not allowed" }, { status: 404 });
  }
  const session = await getServerSession(authOptions);
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  const url = new URL(req.url);
  const targetUrl = `${DASHBOARD_URL}/api/${targetPath}${url.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Binary-safe: arrayBuffer() zachowuje bytes dla multipart/form-data
    // (upload zdjęć serwisowych) i innych binarnych payloadów. text()
    // psułby UTF-8 boundary marker.
    init.body = await req.arrayBuffer();
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
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
