import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
} from "@/lib/admin-auth";
import { keycloak } from "@/lib/keycloak";
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

  // Dashboard-side opt-out: if the user disconnected the Moodle calendar,
  // respect that and don't flip "connected" back on automatically.
  let userDisconnected = false;
  if (session.accessToken) {
    try {
      const userId = await keycloak.getUserIdFromToken(session.accessToken);
      const serviceToken = await keycloak.getServiceAccountToken();
      const userResp = await keycloak.adminRequest(
        `/users/${userId}`,
        serviceToken,
      );
      if (userResp.ok) {
        const user = await userResp.json();
        const flag = user.attributes?.moodle_calendar_connected?.[0];
        if (flag === "false") userDisconnected = true;
      }
    } catch {
      // best-effort — if KC lookup fails, default to the provisioning check below
    }
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
      connected: !userDisconnected,
      configured: true,
      hasRole,
      userDisconnected,
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
