export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { pollKcEvents } from "@/lib/security/kc-events-poll";

/**
 * Manual trigger endpoint — Bearer CRON_SECRET. Domyślnie polling odbywa
 * się w tle co 30s przez instrumentation.ts; ten endpoint pozwala wymusić
 * cykl spoza serwera (np. external cron, monitoring).
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const buf1 = Buffer.from(auth, "utf8");
  const buf2 = Buffer.from(expected, "utf8");
  if (!process.env.CRON_SECRET || buf1.length !== buf2.length || !timingSafeEqual(buf1, buf2)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await pollKcEvents();
  return NextResponse.json({ ok: true, ...result });
}
