import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { provisionSsoLoginUrl, type ChatwootRole } from "@/lib/chatwoot";
import { canAccessChatwootAsAdmin, canAccessChatwootAsAgent } from "@/lib/admin-auth";
import { getFreshKcProfile } from "@/lib/keycloak-profile";
import { getProvider } from "@/lib/permissions/registry";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const logger = log.child({ module: "chatwoot-sso" });

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requested = (req.nextUrl.searchParams.get("role") ?? "").toLowerCase();
  const hasAdmin = canAccessChatwootAsAdmin(session);
  const hasAgent = canAccessChatwootAsAgent(session);

  let role: ChatwootRole;
  if (requested === "admin" || requested === "administrator") {
    if (!hasAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    role = "administrator";
  } else if (requested === "agent") {
    if (!hasAgent && !hasAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    role = "agent";
  } else {
    if (hasAdmin) role = "administrator";
    else if (hasAgent) role = "agent";
    else return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Świeże dane z Keycloak — session JWT potrafi mieć snapshot sprzed godzin.
  const profile = await getFreshKcProfile(userId);
  if (!profile.email) {
    return NextResponse.json(
      { error: "KC user has no email" },
      { status: 409 },
    );
  }

  // Best-effort sync profilu do Chatwoot (first_name/last_name/email).
  // Jeśli provider zwróci błąd, nie blokujemy SSO — użytkownik dalej się
  // zaloguje z tymi danymi co są.
  const chatwootProvider = getProvider("chatwoot");
  if (chatwootProvider?.isConfigured()) {
    await chatwootProvider
      .syncUserProfile({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.displayName,
        phone: profile.phone,
      })
      .catch((err) => {
        logger.warn("chatwoot syncUserProfile failed (non-fatal)", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
  }

  try {
    const url = await provisionSsoLoginUrl(profile.email, profile.displayName, role);
    return NextResponse.redirect(url, { status: 303 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chatwoot SSO failed";
    logger.error("Chatwoot SSO failed", { userId, err: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
