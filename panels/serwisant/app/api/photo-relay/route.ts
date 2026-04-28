export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  const body = await req.arrayBuffer();
  const ct = req.headers.get("content-type") ?? "multipart/form-data";
  try {
    const r = await fetch(`${DASHBOARD_URL}/api/panel/photos/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": ct },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: { message: String(err) } },
      { status: 502 },
    );
  }
}
