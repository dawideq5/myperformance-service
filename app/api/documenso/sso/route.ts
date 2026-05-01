import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessDocumensoAsAdmin,
  canAccessDocumensoAsManager,
  canAccessDocumensoAsMember,
} from "@/lib/admin-auth";
import {
  ensureDocumensoOrganisationMembership,
  getDocumensoBaseUrl,
  syncDocumensoUserRole,
} from "@/lib/documenso";
import { getPublicAppUrl } from "@/lib/app-url";
import { getFreshKcProfile } from "@/lib/keycloak-profile";
import { getProvider } from "@/lib/permissions/registry";
import { log } from "@/lib/logger";

const logger = log.child({ module: "documenso-sso" });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Persona = "admin" | "manager" | "member";

function parseRoleParam(raw: string | null): Persona | null {
  const v = (raw ?? "").toLowerCase();
  if (v === "admin" || v === "administrator") return "admin";
  if (v === "manager" || v === "handler" || v === "obsluga") return "manager";
  if (v === "member" || v === "user") return "member";
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const sessionEmail = session?.user?.email;
  if (!userId || !sessionEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAdmin = canAccessDocumensoAsAdmin(session);
  const hasManager = canAccessDocumensoAsManager(session);
  const hasMember = canAccessDocumensoAsMember(session);

  // Highest-privilege-first selection. Query param can pin a specific
  // persona (used by legacy tiles / deep links); otherwise we pick the
  // best role the user actually has.
  const requested = parseRoleParam(req.nextUrl.searchParams.get("role"));
  let persona: Persona | null;

  if (requested) {
    if (requested === "admin" && !hasAdmin) persona = null;
    else if (requested === "manager" && !hasManager) persona = null;
    else if (requested === "member" && !hasMember) persona = null;
    else persona = requested;
  } else {
    persona = hasAdmin ? "admin" : hasManager ? "manager" : hasMember ? "member" : null;
  }

  // NEXT_PUBLIC_APP_URL jest publiczny, `req.url` w Node API routes za
  // reverse-proxy zwraca wewnętrzny host kontenera (0.0.0.0:3000) —
  // Safari wtedy odmawia ("zastrzeżony port").
  const publicAppUrl = getPublicAppUrl();

  if (!persona) {
    return NextResponse.redirect(
      new URL("/forbidden", publicAppUrl),
      { status: 303 },
    );
  }

  const baseUrl = getDocumensoBaseUrl() ?? "https://sign.myperformance.pl";

  let targetRole: "ADMIN" | "USER";
  let redirectUrl: string;

  if (persona === "admin") {
    targetRole = "ADMIN";
    redirectUrl = `${baseUrl}/admin`;
  } else if (persona === "manager") {
    // Menedżer zespołu — pełne UI Documenso (szablony, webhooki, kontakty
    // org), ale bez admin panelu.
    targetRole = "USER";
    redirectUrl = `${baseUrl}/templates`;
  } else {
    // Pracownik — loguje do Documenso, widzi własne dokumenty w inboxie.
    // Rola USER (nie ADMIN) więc nie ma /admin.
    targetRole = "USER";
    redirectUrl = `${baseUrl}/inbox`;
  }

  // Fresh fetch z KC — session JWT niesie cache, a my potrzebujemy aktualnej
  // nazwy/emaila/telefonu do synchronizacji z Documenso.
  const profile = await getFreshKcProfile(userId);
  const email = profile.email || sessionEmail;

  try {
    await syncDocumensoUserRole(email, targetRole, profile.displayName);
  } catch (err) {
    logger.error("role sync failed", {
      email,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Auto-MEMBER membership w domyślnej Documenso organisation (przywrócone
  // 2026-05-01). Documenso v2 odrzuca login bez OrganisationMember row,
  // więc gwarantujemy minimum MEMBER. Elewacja MANAGER/ADMIN pozostaje
  // explicit — admin nadaje przez /admin/users/[id] → tab Documenso.
  try {
    const result = await ensureDocumensoOrganisationMembership(email);
    if (result === "created") {
      logger.info("auto-MEMBER assigned on SSO", { email });
    }
  } catch (err) {
    // Nie blokujemy loginu — jeśli auto-membership padnie, user dostanie
    // 403 w Documenso UI, ale przynajmniej `User.roles` jest zsync'owane.
    logger.warn("auto-MEMBER assignment failed (non-fatal)", {
      email,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Dodatkowy sync profilu przez provider (imię/nazwisko/telefon w Documenso
  // User). syncDocumensoUserRole zajmuje się tylko email+name+role — phone
  // leci osobno przez providera.
  const documenso = getProvider("documenso");
  if (documenso?.isConfigured()) {
    await documenso
      .syncUserProfile({
        email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.displayName,
        phone: profile.phone,
      })
      .catch((err) => {
        logger.warn("documenso syncUserProfile failed (non-fatal)", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
