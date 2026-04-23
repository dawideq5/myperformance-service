import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { getOptionalEnv } from "@/lib/env";
import { getPublicAppUrl } from "@/lib/app-url";
import { canAccessKnowledgeBase } from "@/lib/admin-auth";
import { getFreshKcProfile } from "@/lib/keycloak-profile";
import { getProvider } from "@/lib/permissions/registry";
import { log } from "@/lib/logger";

const logger = log.child({ module: "outline-launch" });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Launch do bazy wiedzy Outline. Przed redirectem aktualizuje profil w
 * Outline z freshych danych KC (imię/email/telefon) — Outline ma własny
 * OIDC, ale bootstrap usera bez naszego syncu robi tylko raz, potem
 * user.name tkwi w historii.
 */
export async function GET() {
  const publicAppUrl = getPublicAppUrl();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", publicAppUrl), { status: 303 });
  }
  if (!canAccessKnowledgeBase(session)) {
    return NextResponse.redirect(new URL("/forbidden", publicAppUrl), { status: 303 });
  }

  const base =
    (getOptionalEnv("OUTLINE_URL").trim() || "https://knowledge.myperformance.pl").replace(/\/$/, "");

  const userId = session.user.id;
  const outline = getProvider("outline");
  if (outline?.isConfigured()) {
    try {
      const profile = await getFreshKcProfile(userId);
      if (profile.email) {
        await outline.syncUserProfile({
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          displayName: profile.displayName,
          phone: profile.phone,
        });
      }
    } catch (err) {
      logger.warn("outline profile sync failed (non-fatal)", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.redirect(base, { status: 303 });
}
