import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
} from "@/lib/admin-auth";
import { getOptionalEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single-tile launch into Moodle ("Akademia"). Picks the most-capable
 * landing URL the user is entitled to — admin console > teacher view >
 * student view. SSO itself is handled by the auth_oidc plugin on the
 * Moodle side, so we just 303 to the right page.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  }

  const base = (getOptionalEnv("MOODLE_URL").trim() || "https://moodle.myperformance.pl").replace(/\/$/, "");

  const hasAdmin = canAccessMoodleAsAdmin(session);
  const hasTeacher = canAccessMoodleAsTeacher(session);
  const hasStudent = canAccessMoodleAsStudent(session);

  let path: string;
  if (hasAdmin) path = "/admin/";
  else if (hasTeacher) path = "/course/";
  else if (hasStudent) path = "/my/";
  else {
    return NextResponse.redirect(new URL("/forbidden", req.url), { status: 303 });
  }

  return NextResponse.redirect(`${base}${path}`, { status: 303 });
}
