export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDashboardUrl } from "@/lib/dashboard";

interface RouteContext {
  params: Promise<{ token: string }>;
}

/**
 * Public upload proxy. The mobile browser POSTs the photo to this endpoint
 * (same-origin), and we forward it as a multipart upload to the dashboard's
 * authoritative `/api/upload-bridge/upload` route. The signed token in the URL
 * is the only credential — the dashboard validates HMAC + expiry.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const { token } = await ctx.params;
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Oczekiwano multipart/form-data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Pole `file` jest wymagane (multipart)." },
      { status: 400 },
    );
  }

  // Re-build clean FormData with token + file (drop any other client-supplied fields).
  const outbound = new FormData();
  outbound.set("token", token);
  outbound.set("file", file, (file as File).name || "upload.bin");

  const target = `${getDashboardUrl()}/api/upload-bridge/upload`;
  try {
    const r = await fetch(target, {
      method: "POST",
      body: outbound,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
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
      { error: "upstream_failed", detail: String(err) },
      { status: 502 },
    );
  }
}
