export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pollKcEvents } from "@/lib/security/kc-events-poll";

/**
 * Manual trigger endpoint — Bearer CRON_SECRET. Domyślnie polling odbywa
 * się w tle co 30s przez instrumentation.ts; ten endpoint pozwala wymusić
 * cykl spoza serwera (np. external cron, monitoring).
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await pollKcEvents();
  return NextResponse.json({ ok: true, ...result });
}
