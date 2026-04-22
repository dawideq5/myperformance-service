import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessDocumensoAsAdmin,
  canAccessDocumensoAsHandler,
  canAccessDocumensoAsUser,
} from "@/lib/admin-auth";
import { syncDocumensoUserRole, getDocumensoBaseUrl } from "@/lib/documenso";
import { getPublicAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Persona = "admin" | "handler" | "user";

function parseRoleParam(raw: string | null): Persona | null {
  const v = (raw ?? "").toLowerCase();
  if (v === "admin" || v === "administrator") return "admin";
  if (v === "handler" || v === "obsluga") return "handler";
  if (v === "user") return "user";
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAdmin = canAccessDocumensoAsAdmin(session);
  const hasHandler = canAccessDocumensoAsHandler(session);
  const hasUser = canAccessDocumensoAsUser(session);

  // Highest-privilege-first selection. Query param can pin a specific
  // persona (used by legacy tiles / deep links); otherwise we pick the
  // best role the user actually has.
  const requested = parseRoleParam(req.nextUrl.searchParams.get("role"));
  let persona: Persona | null;

  if (requested) {
    if (requested === "admin" && !hasAdmin) persona = null;
    else if (requested === "handler" && !hasHandler && !hasAdmin) persona = null;
    else if (requested === "user" && !hasUser && !hasHandler && !hasAdmin)
      persona = null;
    else persona = requested;
  } else {
    persona = hasAdmin ? "admin" : hasHandler ? "handler" : hasUser ? "user" : null;
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
  const dashboardBase = new URL("/", publicAppUrl);

  let targetRole: "ADMIN" | "USER" | "DOCUMENSO_EMPLOYEE";
  let redirectUrl: string;

  if (persona === "admin") {
    targetRole = "ADMIN";
    redirectUrl = `${baseUrl}/admin`;
  } else if (persona === "handler") {
    // Handler operates from the dashboard-side view backed by the
    // Documenso admin API token. DB role stays USER.
    targetRole = "USER";
    dashboardBase.pathname = "/dashboard/documents-handler";
    redirectUrl = dashboardBase.toString();
  } else {
    // documenso_user (pracownik) — suspendsujemy konto Documenso
    // (disabled=true) aby zablokować login do Documenso UI. Pracownik
    // podpisuje wyłącznie przez guest-signer email linki (działa bez
    // aktywnego User rekordu). Dashboard pokazuje „Twoje dokumenty"
    // poprzez Admin API.
    targetRole = "DOCUMENSO_EMPLOYEE";
    dashboardBase.pathname = "/dashboard";
    dashboardBase.searchParams.set("notice", "documenso-employee-no-ui");
    redirectUrl = dashboardBase.toString();
  }

  try {
    // Przekazujemy name z sesji KC — dzięki temu każde SSO do Documenso
    // refreshuje User.name zgodnie z aktualnym stanem Keycloaka (KC = SoT).
    await syncDocumensoUserRole(email, targetRole, session?.user?.name ?? null);
  } catch (err) {
    console.error("[documenso-sso] role sync failed:", err);
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
