import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
} from "@/lib/admin-auth";
import {
  createUserEvent,
  deleteUserEvent,
  getUserByEmail,
  getUserCalendarEvents,
  isMoodleConfigured,
  updateUserEvent,
} from "@/lib/moodle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEpoch(value: string | null): number | undefined {
  if (!value) return undefined;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed / 1000);
}

// Moodle user-events (eventtype === 'user') are the only ones we let the
// panel mutate — course/site/group events are controlled in Moodle itself.
function shape(ev: {
  id: number;
  name: string;
  description?: string;
  timestart: number;
  timeduration: number;
  eventtype: string;
  location?: string | null;
  url?: string | null;
}) {
  const readOnly = ev.eventtype !== "user";
  return {
    id: `moodle_${ev.id}`,
    moodleEventId: ev.id,
    title: ev.name,
    description: ev.description ?? undefined,
    startDate: new Date(ev.timestart * 1000).toISOString(),
    endDate: new Date(
      (ev.timestart + (ev.timeduration || 0)) * 1000,
    ).toISOString(),
    allDay: ev.timeduration >= 86400 - 60,
    location: ev.location ?? undefined,
    url: ev.url ?? undefined,
    source: "moodle" as const,
    eventtype: ev.eventtype,
    color: "#F59E0B",
    readOnly,
  };
}

async function ensureAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (
    !canAccessMoodleAsStudent(session) &&
    !canAccessMoodleAsTeacher(session) &&
    !canAccessMoodleAsAdmin(session)
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!isMoodleConfigured()) {
    return { session, configured: false as const };
  }
  return { session, configured: true as const };
}

export async function GET(request: NextRequest) {
  const ctx = await ensureAccess();
  if ("error" in ctx) return ctx.error;
  if (!ctx.configured) return NextResponse.json({ events: [] });

  const email = ctx.session.user!.email ?? "";
  if (!email) return NextResponse.json({ events: [] });

  const { searchParams } = new URL(request.url);
  const timestart = parseEpoch(searchParams.get("from"));
  const timeend = parseEpoch(searchParams.get("to"));

  try {
    const user = await getUserByEmail(email);
    if (!user) return NextResponse.json({ events: [] });
    const events = await getUserCalendarEvents(user.id, { timestart, timeend });
    return NextResponse.json({ events: events.map(shape) });
  } catch (err) {
    console.error("[moodle-events]", err);
    return NextResponse.json({ events: [], error: "fetch_failed" });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await ensureAccess();
  if ("error" in ctx) return ctx.error;
  if (!ctx.configured) {
    return NextResponse.json({ error: "Moodle not configured" }, { status: 400 });
  }
  const email = ctx.session.user!.email ?? "";
  if (!email) return NextResponse.json({ error: "no_email" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { title, description, startDate, endDate, allDay, location } = body as {
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    allDay?: boolean;
    location?: string;
  };
  if (!title || !startDate || !endDate) {
    return NextResponse.json({ error: "title/start/end required" }, { status: 400 });
  }
  const timestart = Math.floor(new Date(startDate).getTime() / 1000);
  const timeend = Math.floor(new Date(endDate).getTime() / 1000);
  const timeduration = Math.max(0, timeend - timestart);

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "not_provisioned" }, { status: 404 });
    }
    const created = await createUserEvent({
      name: title.trim().slice(0, 255),
      description: description?.trim().slice(0, 1000),
      timestart,
      timeduration: allDay ? 86400 : timeduration,
      location: location?.trim().slice(0, 255) || undefined,
      userId: user.id,
    });
    return NextResponse.json({ event: shape(created) }, { status: 201 });
  } catch (err) {
    console.error("[moodle-events POST]", err);
    return NextResponse.json({ error: "create_failed" }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const ctx = await ensureAccess();
  if ("error" in ctx) return ctx.error;
  if (!ctx.configured) {
    return NextResponse.json({ error: "Moodle not configured" }, { status: 400 });
  }
  const email = ctx.session.user!.email ?? "";
  if (!email) return NextResponse.json({ error: "no_email" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { id, title, description, startDate, endDate, allDay, location } =
    body as {
      id?: number | string;
      title?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
      allDay?: boolean;
      location?: string;
    };
  const moodleId = Number(id);
  if (!moodleId || !title || !startDate || !endDate) {
    return NextResponse.json({ error: "id/title/start/end required" }, { status: 400 });
  }
  const timestart = Math.floor(new Date(startDate).getTime() / 1000);
  const timeend = Math.floor(new Date(endDate).getTime() / 1000);
  const timeduration = Math.max(0, timeend - timestart);

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "not_provisioned" }, { status: 404 });
    }
    const updated = await updateUserEvent(moodleId, {
      name: title.trim().slice(0, 255),
      description: description?.trim().slice(0, 1000),
      timestart,
      timeduration: allDay ? 86400 : timeduration,
      location: location?.trim().slice(0, 255) || undefined,
      userId: user.id,
    });
    return NextResponse.json({ event: shape(updated) });
  } catch (err) {
    console.error("[moodle-events PUT]", err);
    return NextResponse.json(
      { error: "update_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await ensureAccess();
  if ("error" in ctx) return ctx.error;
  if (!ctx.configured) {
    return NextResponse.json({ error: "Moodle not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    await deleteUserEvent(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[moodle-events DELETE]", err);
    return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  }
}
