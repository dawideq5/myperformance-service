import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
} from "@/lib/admin-auth";
import {
  getUserByEmail,
  getUserCalendarEvents,
  isMoodleConfigured,
} from "@/lib/moodle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !canAccessMoodleAsStudent(session) &&
    !canAccessMoodleAsTeacher(session) &&
    !canAccessMoodleAsAdmin(session)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isMoodleConfigured()) {
    return NextResponse.json({ events: [] });
  }

  const email = session.user.email ?? "";
  if (!email) return NextResponse.json({ events: [] });

  try {
    const user = await getUserByEmail(email);
    if (!user) return NextResponse.json({ events: [] });
    const events = await getUserCalendarEvents(user.id);
    const shaped = events.map((ev) => ({
      id: `moodle_${ev.id}`,
      title: ev.name,
      description: ev.description ?? undefined,
      startDate: new Date(ev.timestart * 1000).toISOString(),
      endDate: new Date((ev.timestart + (ev.timeduration || 0)) * 1000).toISOString(),
      allDay: ev.timeduration >= 86400 - 60,
      location: ev.location ?? undefined,
      url: ev.url ?? undefined,
      source: "moodle" as const,
      color: "#F97316",
      readOnly: true,
    }));
    return NextResponse.json({ events: shaped });
  } catch (err) {
    console.error("[moodle-events]", err);
    return NextResponse.json({ events: [], error: "fetch_failed" });
  }
}
