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

  // Pre-provisioning w Moodle PRZED redirectem do auth_oidc. Robimy to
  // sami (a nie polegamy na auto-create przez plugin) bo:
  //   - dashboard musi gwarantować `mdl_user.username = LOWER(email)` —
  //     auth_oidc z `bindingusernameclaim=email` matchuje po username
  //   - bez pre-provisioningu first-time SSO leci w błąd "There was a
  //     problem logging you in" gdy plugin nie potrafi utworzyć konta
  //     (np. niezweryfikowany email, kolizja username, missing claim)
  // Świeży profil z KC = źródło prawdy dla firstname/lastname/email.
  const userId = session.user.id;
  if (userId) {
    const moodle = getProvider("moodle");
    if (moodle?.isConfigured() && "ensureUser" in moodle && typeof moodle.ensureUser === "function") {
      try {
        const profile = await getFreshKcProfile(userId);
        if (profile.email) {
          await (moodle as unknown as {
            ensureUser: (a: {
              email: string;
              displayName: string;
              firstName?: string | null;
              lastName?: string | null;
              phone?: string | null;
              kcSub?: string | null;
            }) => Promise<number | null>;
          }).ensureUser({
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            displayName: profile.displayName,
            phone: profile.phone,
            kcSub: userId,
          });
        }
      } catch (err) {
        logger.warn("moodle ensureUser failed (non-fatal, plugin może i tak utworzyć)", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return NextResponse.redirect(`${base}${path}`, { status: 303 });
}
