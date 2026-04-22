import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Disconnect Moodle calendar" is a dashboard-side opt-out. We don't
 * deprovision the Moodle account — user keeps access to Akademia — we
 * just stop pulling events into the unified calendar view.
 *
 * Preference is stored on the Keycloak user as an attribute so it
 * survives sessions and follows the user across devices.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = await keycloak.getUserIdFromToken(session.accessToken);
  const serviceToken = await keycloak.getServiceAccountToken();

  const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
  if (!userResp.ok) {
    return NextResponse.json({ error: "user_fetch_failed" }, { status: 502 });
  }
  const user = await userResp.json();
  const attrs = { ...(user.attributes ?? {}) };
  attrs.moodle_calendar_connected = ["false"];

  const update = await keycloak.adminRequest(`/users/${userId}`, serviceToken, {
    method: "PUT",
    body: JSON.stringify({ attributes: attrs }),
  });
  if (!update.ok) {
    return NextResponse.json({ error: "user_update_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, connected: false });
}
