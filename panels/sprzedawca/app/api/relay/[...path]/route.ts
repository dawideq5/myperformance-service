export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

/**
 * Proxy z paneli do dashboard /api/panel/* oraz /api/account/*. Panel-side
 * NextAuth session trzyma KC accessToken; client-side nie ma do niego
 * dostępu, więc proxyjemy server-side.
 *
 * Whitelist:
 *  - prefiks `account` → `${DASHBOARD_URL}/api/account/<reszta>` (inbox, prefs)
 *  - pozostałe        → `${DASHBOARD_URL}/api/panel/<path>`
 * Każda inna ścieżka → 404.
 */
const ALLOWED_PANEL_PREFIXES = new Set([
  "services",
  "claims",
  "protections",
  "pricelist",
  "transport-jobs",
  "me",
  "repair-types",
  "quote",
  "service-locations",
  // Wave 21 Faza 1A — DeviceLocationMap potrzebuje lat/lng punktów (full
  // Location object), których service-locations endpoint nie zwraca.
  "locations",
  // Wave 24 — draft intake co-edit publish dla Chatwoot Dashboard App.
  "intake-drafts",
]);
const ALLOWED_ACCOUNT_PREFIXES = new Set(["inbox"]);
// Wave 23 — top-level mounts mapped 1:1 to /api/<segment>/...
//   livekit: panel uses /api/livekit/start-publisher + /api/livekit/end-room
//            + /api/livekit/room-status (Wave 23 overlay polling) to
//            initiate / end / poll consultation video sessions during intake.
const ALLOWED_ROOT_PREFIXES = new Set(["livekit"]);

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
    signal: AbortSignal.timeout(15_000),
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Binary-safe: arrayBuffer zachowuje bytes dla multipart/form-data
    // (upload zdjęć serwisowych). text() korumpuje binary boundary.
    init.body = await req.arrayBuffer();
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
