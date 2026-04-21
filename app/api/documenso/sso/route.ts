import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessDocumensoAsAdmin,
  canAccessDocumensoAsUser,
} from "@/lib/admin-auth";
import { syncDocumensoUserRole, getDocumensoBaseUrl } from "@/lib/documenso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requested = (req.nextUrl.searchParams.get("role") ?? "").toLowerCase();
  const hasAdmin = canAccessDocumensoAsAdmin(session);
  const hasUser = canAccessDocumensoAsUser(session);

  const wantsAdmin = requested === "admin" || requested === "administrator";
  const wantsUser = requested === "user" || requested === "";

  let targetRole: "ADMIN" | "USER";
  let redirectPath: string;

  if (wantsAdmin) {
    if (!hasAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    targetRole = "ADMIN";
    redirectPath = "/admin";
  } else if (wantsUser) {
    if (!hasUser && !hasAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    targetRole = "USER";
    redirectPath = "/documents";
  } else {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const baseUrl = getDocumensoBaseUrl() ?? "https://sign.myperformance.pl";

  try {
    await syncDocumensoUserRole(email, targetRole);
  } catch (err) {
    // DB sync is best-effort — on failure, log and still redirect. The user
    // may end up with a stale role, but we do not want to block login.
    console.error("[documenso-sso] role sync failed:", err);
  }

  return NextResponse.redirect(`${baseUrl}${redirectPath}`, { status: 303 });
}
