import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  delete attrs.moodle_calendar_connected;
  const update = await keycloak.adminRequest(`/users/${userId}`, serviceToken, {
    method: "PUT",
    body: JSON.stringify({ attributes: attrs }),
  });
  if (!update.ok) {
    return NextResponse.json({ error: "user_update_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, connected: true });
}
