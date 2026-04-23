import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
} from "@/lib/admin-auth";
import { getOptionalEnv } from "@/lib/env";
import { getPublicAppUrl } from "@/lib/app-url";
import { getFreshKcProfile } from "@/lib/keycloak-profile";
import { getProvider } from "@/lib/permissions/registry";
import { log } from "@/lib/logger";

const logger = log.child({ module: "moodle-launch" });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single-tile launch into Moodle ("Akademia"). Picks the most-capable
 * landing URL the user is entitled to — admin console > teacher view >
 * student view. SSO itself is handled by the auth_oidc plugin on the
 * Moodle side, so we just 303 to the right page.
 */
export async function GET() {
  const publicAppUrl = getPublicAppUrl();
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(
      new URL("/login", publicAppUrl),
      { status: 303 },
    );
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
    return NextResponse.redirect(
      new URL("/forbidden", publicAppUrl),
      { status: 303 },
    );
  }

  // Świeża propagacja profilu do Moodle przy każdym launch. auth_oidc sam
  // tworzy usera przy pierwszym logowaniu, ale imię/nazwisko/email mogło się
  // zmienić w KC od tego czasu — sync provider nadgoni.
  const userId = session.user.id;
  if (userId) {
    const moodle = getProvider("moodle");
    if (moodle?.isConfigured()) {
      try {
        const profile = await getFreshKcProfile(userId);
        if (profile.email) {
          await moodle.syncUserProfile({
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            displayName: profile.displayName,
            phone: profile.phone,
          });
        }
      } catch (err) {
        logger.warn("moodle profile sync failed (non-fatal)", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return NextResponse.redirect(`${base}${path}`, { status: 303 });
}
