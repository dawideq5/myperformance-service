import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  enrichWithPresence,
  enrichWithRoles,
  isKeycloakConfigured,
  listAllUsers,
  listUsersWithRole,
} from "@/lib/keycloak-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set([
  "sprzedawca",
  "serwisant",
  "kierowca",
  "dokumenty_access",
  "app_user",
  "admin",
  "all",
]);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = ((session.user as { roles?: string[] } | undefined)?.roles ?? []) as string[];
  if (!roles.includes("dokumenty_access") && !roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isKeycloakConfigured()) {
    return NextResponse.json({ users: [], configured: false });
  }

  const url = new URL(req.url);
  const roleFilter = url.searchParams.get("role") ?? "all";
  const withPresence = url.searchParams.get("presence") !== "0";
  const withRoles = url.searchParams.get("roles") !== "0";

  if (!ALLOWED_ROLES.has(roleFilter)) {
    return NextResponse.json({ error: "role not allowed" }, { status: 400 });
  }

  try {
    let users = roleFilter === "all"
      ? await listAllUsers()
      : await listUsersWithRole(roleFilter);

    if (withRoles) users = await enrichWithRoles(users);
    if (withPresence) users = await enrichWithPresence(users);

    users.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      const la = a.lastActiveAt ?? 0;
      const lb = b.lastActiveAt ?? 0;
      if (la !== lb) return lb - la;
      return (a.email ?? "").localeCompare(b.email ?? "");
    });

    return NextResponse.json({ users, configured: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Keycloak lookup failed" },
      { status: 503 },
    );
  }
}
