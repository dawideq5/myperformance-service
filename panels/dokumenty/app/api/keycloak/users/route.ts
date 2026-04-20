import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions, REQUIRED_ROLE } from "@/lib/auth";
import { listUsersWithRole } from "@/lib/keycloak-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set([
  "sprzedawca",
  "serwisant",
  "kierowca",
  "dokumenty_access",
  "app_user",
]);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.includes(REQUIRED_ROLE) && !roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const role = url.searchParams.get("role") ?? "app_user";
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "role not allowed" }, { status: 400 });
  }

  try {
    const users = await listUsersWithRole(role);
    return NextResponse.json({ users });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Keycloak lookup failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
