export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canAccessConfigHub } from "@/lib/admin-auth";
import {
  createAnnouncement,
  listAnnouncements,
  type AnnouncementInput,
} from "@/lib/announcements";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessConfigHub(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const items = await listAnnouncements();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessConfigHub(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Partial<AnnouncementInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title) {
    return NextResponse.json(
      { error: "title jest wymagany" },
      { status: 400 },
    );
  }
  try {
    const created = await createAnnouncement(body as AnnouncementInput);
    return NextResponse.json({ item: created });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      { status: 500 },
    );
  }
}
