import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { getOptionalEnv } from "@/lib/env";
import { getPublicAppUrl } from "@/lib/app-url";
import { canAccessDirectus } from "@/lib/admin-auth";
import { getFreshKcProfile } from "@/lib/keycloak-profile";
import { getProvider } from "@/lib/permissions/registry";
import { log } from "@/lib/logger";

const logger = log.child({ module: "directus-launch" });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Launch do Directus CMS. Przed redirectem synchronizuje profil z KC
 * (Directus ma natywny OIDC, ale tworzy user tylko przy first-login
 * i nie odświeża name/phone po zmianach w KC).
 */
export async function GET() {
  const publicAppUrl = getPublicAppUrl();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", publicAppUrl), { status: 303 });
  }
  if (!canAccessDirectus(session)) {
    return NextResponse.redirect(new URL("/forbidden", publicAppUrl), { status: 303 });
  }

  const base =
    (getOptionalEnv("DIRECTUS_URL").trim() || "https://cms.myperformance.pl").replace(/\/$/, "");

  const userId = session.user.id;
  const directus = getProvider("directus");
  if (directus?.isConfigured()) {
    try {
      const profile = await getFreshKcProfile(userId);
      if (profile.email) {
        await directus.syncUserProfile({
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          displayName: profile.displayName,
          phone: profile.phone,
        });
      }
    } catch (err) {
      logger.warn("directus profile sync failed (non-fatal)", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.redirect(base, { status: 303 });
}
