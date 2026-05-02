export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDashboardUrl } from "@/lib/dashboard";

interface RouteContext {
  params: Promise<{ token: string }>;
}

/**
 * Public status proxy. Forwards GET to dashboard's `/api/upload-bridge/status/[token]`.
 * Used by the mobile UI to render ticket header + countdown + upload counter.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { token } = await ctx.params;
  if (!token) {
    return NextResponse.json({ valid: false, reason: "missing_token" }, { status: 400 });
  }
  const target = `${getDashboardUrl()}/api/upload-bridge/status/${encodeURIComponent(token)}`;
  try {
    const r = await fetch(target, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { valid: false, reason: "upstream_failed", detail: String(err) },
      { status: 502 },
    );
  }
}
