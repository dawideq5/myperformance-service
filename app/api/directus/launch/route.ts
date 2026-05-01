import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { getOptionalEnv } from "@/lib/env";
import { getPublicAppUrl } from "@/lib/app-url";
import { canAccessDirectus } from "@/lib/admin-auth";
import { getFreshKcProfile } from "@/lib/keycloak-profile";
import { getProvider } from "@/lib/permissions/registry";
import { log } from "@/lib/logger";

interface DirectusUserLookup {
  id: string;
  provider?: string | null;
  external_identifier?: string | null;
}

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

  // Pre-flight: upewnij się że użytkownik ma provider=keycloak i
  // external_identifier ustawiony na KC user UUID — bez tego Directus
  // zwróci "Wrong username or password" przy OIDC login mimo poprawnego tokena.
  const email = session.user.email ?? null;
  const kcUserId = session.user.id;
  const directusUrl = (getOptionalEnv("DIRECTUS_URL") ?? "").replace(/\/$/, "");
  const directusAdminToken = getOptionalEnv("DIRECTUS_ADMIN_TOKEN") ?? "";
  if (email && directusUrl && directusAdminToken) {
    try {
      const lookupRes = await fetch(
        `${directusUrl}/users?filter[email][_eq]=${encodeURIComponent(email)}&fields=id,provider,external_identifier`,
        { headers: { Authorization: `Bearer ${directusAdminToken}` }, cache: "no-store" },
      );
      if (lookupRes.ok) {
        const lookupData = (await lookupRes.json()) as { data?: DirectusUserLookup[] };
        const directusUser = lookupData.data?.[0];
        if (
          directusUser &&
          (directusUser.provider !== "keycloak" || !directusUser.external_identifier)
        ) {
          await fetch(`${directusUrl}/users/${directusUser.id}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${directusAdminToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              provider: "keycloak",
              external_identifier: kcUserId,
              auth_data: null,
            }),
            cache: "no-store",
          });
          logger.info("directus provider sync applied", {
            userId: kcUserId,
            directusUserId: directusUser.id,
            prevProvider: directusUser.provider,
          });
        }
      }
    } catch (e) {
      logger.warn("[directus-launch] provider sync failed (non-fatal):", {
        userId: kcUserId,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.redirect(base, { status: 303 });
}
