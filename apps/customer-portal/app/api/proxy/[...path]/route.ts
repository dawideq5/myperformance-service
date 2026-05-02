import { NextResponse } from "next/server";

/**
 * Same-origin proxy z customer-portal (zlecenieserwisowe.pl) do dashboardu
 * (myperformance.pl) dla `/api/customer-portal/*`. Frontend wywołuje
 * `/api/proxy/auth/email-otp`; my forwardujemy do
 * `${DASHBOARD_URL}/api/customer-portal/auth/email-otp`.
 *
 * Cookies:
 *  - Browser → portal: cookie `customer_portal_otp_session` przy
 *    Domain=.zlecenieserwisowe.pl; jeśli set, dołączamy do upstream.
 *  - Portal → dashboard: forwardujemy `Cookie: customer_portal_otp_session=...`.
 *  - Dashboard → portal: dashboard nie zna domeny zlecenieserwisowe; jego
 *    `Set-Cookie` ma już Domain=.zlecenieserwisowe.pl ustawione w
 *    `lib/customer-portal/session.ts`. Re-emitujemy 1:1.
 *  - Portal → browser: re-emitujemy `Set-Cookie` headers z dashboardu.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS"]);
const ALLOWED_PATH_RE = /^[a-z0-9/_\-\[\]]+$/i;

function getDashboardOrigin(): string {
  const raw = process.env.DASHBOARD_URL?.trim() || "https://myperformance.pl";
  return raw.replace(/\/$/, "");
}

async function handle(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  if (!ALLOWED_METHODS.has(req.method)) {
    return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
  }
  const { path } = await ctx.params;
  const subPath = (path ?? []).join("/");
  if (!subPath || !ALLOWED_PATH_RE.test(subPath)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const url = `${getDashboardOrigin()}/api/customer-portal/${subPath}`;
  const cookie = req.headers.get("cookie") ?? "";

  const upstreamHeaders: Record<string, string> = {
    Accept: req.headers.get("accept") ?? "application/json",
  };
  const ct = req.headers.get("content-type");
  if (ct) upstreamHeaders["Content-Type"] = ct;
  if (cookie) upstreamHeaders["Cookie"] = cookie;

  let bodyText: string | undefined;
  if (req.method === "POST") {
    bodyText = await req.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers: upstreamHeaders,
      body: bodyText,
      // Nie ustawiamy `redirect: "follow"` — chcemy 302 widzieć surowe.
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "upstream_unreachable",
        detail: err instanceof Error ? err.message : "network",
      },
      { status: 502 },
    );
  }

  const respHeaders = new Headers();
  // Forward Content-Type + Set-Cookie (multiple). Drop encodings — fetch
  // upstream już zdekodowało.
  for (const [k, v] of upstream.headers.entries()) {
    const lower = k.toLowerCase();
    if (lower === "content-encoding" || lower === "transfer-encoding") continue;
    if (lower === "set-cookie") {
      // Headers Web API może mieć tylko jeden set-cookie; getSetCookie() istnieje
      // od Node 20.
      continue;
    }
    if (lower === "content-type" || lower === "cache-control") {
      respHeaders.set(k, v);
    }
  }
  // getSetCookie() preferowane (Node 20+).
  type WithSetCookies = Headers & { getSetCookie?: () => string[] };
  const headersWithSetCookie = upstream.headers as WithSetCookies;
  const setCookieList =
    typeof headersWithSetCookie.getSetCookie === "function"
      ? headersWithSetCookie.getSetCookie()
      : [];
  for (const c of setCookieList) {
    respHeaders.append("Set-Cookie", c);
  }

  const buf = await upstream.arrayBuffer();
  return new Response(buf, { status: upstream.status, headers: respHeaders });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(req, ctx);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(req, ctx);
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
