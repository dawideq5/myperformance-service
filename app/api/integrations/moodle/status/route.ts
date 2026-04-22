import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
} from "@/lib/admin-auth";
import { getUserByEmail, isMoodleConfigured } from "@/lib/moodle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hasRole =
    canAccessMoodleAsStudent(session) ||
    canAccessMoodleAsTeacher(session) ||
    canAccessMoodleAsAdmin(session);
  if (!isMoodleConfigured()) {
    return NextResponse.json({ connected: false, configured: false, hasRole });
  }
  if (!hasRole) {
    return NextResponse.json({ connected: false, configured: true, hasRole: false });
  }
  const email = session.user.email ?? "";
  if (!email) {
    return NextResponse.json({ connected: false, configured: true, hasRole });
  }
  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({
        connected: false,
        configured: true,
        hasRole,
        reason: "not_provisioned",
      });
    }
    return NextResponse.json({
      connected: true,
      configured: true,
      hasRole,
      moodleUserId: user.id,
      fullname: user.fullname,
      username: user.username,
    });
  } catch (err) {
    console.error("[moodle-status]", err);
    return NextResponse.json({
      connected: false,
      configured: true,
      hasRole,
      reason: "unreachable",
    });
  }
}
