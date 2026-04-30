import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";

const logger = log.child({ module: "google-connect" });

const ALLOWED_FEATURES = new Set([
  "email_verification",
  "calendar",
]);

/**
 * POST /api/integrations/google/connect
 *
 * Persists the user's chosen integration features (calendar, gmail, email
 * verification) as a Keycloak user attribute before the browser is redirected
 * to the Google consent screen. The actual OAuth flow is driven on the client
 * side via NextAuth signIn with kc_action=idp_link:google (Keycloak 26.3+ AIA).
 *
 * Body: { features: string[] }
 *   - email_verification: confirm and mark email as verified
 *   - calendar: create and manage calendar events on user's behalf
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawFeatures: unknown = body?.features;
    const features = Array.isArray(rawFeatures)
      ? rawFeatures
          .filter((feature): feature is string => typeof feature === "string")
          .filter((feature) => ALLOWED_FEATURES.has(feature))
      : [];

    if (features.length === 0) {
      return NextResponse.json(
        { error: "At least one feature must be selected" },
        { status: 400 }
      );
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    await keycloak.updateUserAttributes(serviceToken, userId, {
      google_features_requested: features,
      google_features_requested_at: [new Date().toISOString()],
    });

    logger.info("google features saved", { userId, featureCount: features.length });
    return NextResponse.json({ success: true, features });
  } catch (error) {
    logger.error("connect failed", {
      err: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
