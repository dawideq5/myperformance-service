import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

type FeatureResult = { ok: boolean; skipped?: boolean; error?: string; [k: string]: any };

/**
 * POST /api/integrations/google/provision
 *
 * Post-link provisioning for Google integration. Steps:
 *  1. Reads selected features from user attribute `google_features_requested`.
 *  2. Fetches Google access token from Keycloak broker endpoint.
 *  3. Verifies Google account email matches Keycloak account email.
 *     If mismatch → removes federated identity and returns 409.
 *  4. If Google confirms email_verified → sets Keycloak emailVerified=true
 *     and clears VERIFY_EMAIL required action.
 *  5. For each selected feature, performs the corresponding Google API call:
 *     - calendar → creates confirmation event in primary calendar
 *     - gmail_labels → creates "MyPerformance" label (folder)
 *     - email_verification → handled in step 4 implicitly
 */
export async function POST() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
    if (!userResp.ok) {
      return NextResponse.json(
        { error: "Failed to load user data" },
        { status: 500 }
      );
    }
    const userData = await userResp.json();

    const requestedFeatures: string[] =
      (userData.attributes?.google_features_requested as string[]) || [];

    console.log("[Google Provision] User attributes:", JSON.stringify(userData.attributes));
    console.log("[Google Provision] Requested features:", requestedFeatures);

    let googleTokens: Record<string, any>;
    try {
      googleTokens = await keycloak.getBrokerTokens(session.accessToken, "google");
    } catch (err: any) {
      console.error("[Google Provision] Broker token fetch failed:", err?.message);
      return NextResponse.json(
        { error: "Failed to get Google token from Keycloak" },
        { status: 502 }
      );
    }

    const googleAccessToken: string | undefined = googleTokens.access_token;
    if (!googleAccessToken) {
      console.error(
        "[Google Provision] No access_token in broker response:",
        googleTokens
      );
      return NextResponse.json(
        { error: "Google access token unavailable" },
        { status: 500 }
      );
    }

    // Step 3: verify Google email matches Keycloak email
    let googleUserInfo: {
      sub: string;
      email: string;
      email_verified: boolean;
    };
    try {
      googleUserInfo = await keycloak.getGoogleUserInfo(googleAccessToken);
    } catch (err: any) {
      console.error("[Google Provision] Google userinfo fetch failed:", err?.message);
      return NextResponse.json(
        { error: "Failed to fetch Google user info" },
        { status: 502 }
      );
    }

    const keycloakEmail = (userData.email || "").toLowerCase().trim();
    const googleEmail = (googleUserInfo.email || "").toLowerCase().trim();

    if (!keycloakEmail || !googleEmail || keycloakEmail !== googleEmail) {
      console.warn(
        "[Google Provision] Email mismatch, unlinking. Keycloak:",
        keycloakEmail,
        "Google:",
        googleEmail
      );
      try {
        await keycloak.removeFederatedIdentity(serviceToken, userId, "google");
      } catch (unlinkErr: any) {
        console.error(
          "[Google Provision] Failed to remove federated identity:",
          unlinkErr?.message
        );
      }
      return NextResponse.json(
        {
          error: "email_mismatch",
          message:
            "Email konta Google nie zgadza się z emailem w MyPerformance. Połączenie zostało anulowane.",
          keycloakEmail,
          googleEmail,
        },
        { status: 409 }
      );
    }

    const results: {
      emailVerified: FeatureResult;
      calendar: FeatureResult;
      gmail: FeatureResult;
    } = {
      emailVerified: { ok: false, skipped: true },
      calendar: { ok: false, skipped: true },
      gmail: { ok: false, skipped: true },
    };

    // Step 4: auto email verification (always runs if Google confirms)
    if (googleUserInfo.email_verified) {
      try {
        await keycloak.setEmailVerified(serviceToken, userId, true);
        results.emailVerified = { ok: true };
      } catch (err: any) {
        console.error(
          "[Google Provision] Failed to set emailVerified:",
          err?.message
        );
        results.emailVerified = { ok: false, error: err?.message || "unknown" };
      }
    }

    // Step 5: feature-gated API calls
    if (requestedFeatures.includes("calendar")) {
      const start = new Date();
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      try {
        const calResp = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              summary: "Podpięcie konta Google pod MyPerformance",
              description:
                "Twoje konto Google zostało pomyślnie powiązane z aplikacją MyPerformance.",
              start: { dateTime: start.toISOString() },
              end: { dateTime: end.toISOString() },
            }),
          }
        );

        if (calResp.ok) {
          const data = await calResp.json();
          results.calendar = { ok: true, id: data.id };
        } else {
          const errText = await calResp.text();
          console.error(
            "[Google Provision] Calendar event failed:",
            calResp.status,
            errText
          );
          results.calendar = {
            ok: false,
            error: `${calResp.status}: ${errText}`,
          };
        }
      } catch (err: any) {
        console.error("[Google Provision] Calendar exception:", err);
        results.calendar = { ok: false, error: err?.message || "unknown" };
      }
    }

    if (requestedFeatures.includes("gmail_labels")) {
      try {
        const gmailResp = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/labels",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: "MyPerformance",
              labelListVisibility: "labelShow",
              messageListVisibility: "show",
            }),
          }
        );

        if (gmailResp.ok) {
          const data = await gmailResp.json();
          results.gmail = { ok: true, id: data.id };
        } else if (gmailResp.status === 409) {
          results.gmail = { ok: true, alreadyExists: true };
        } else {
          const errText = await gmailResp.text();
          console.error(
            "[Google Provision] Gmail label failed:",
            gmailResp.status,
            errText
          );
          results.gmail = {
            ok: false,
            error: `${gmailResp.status}: ${errText}`,
          };
        }
      } catch (err: any) {
        console.error("[Google Provision] Gmail exception:", err);
        results.gmail = { ok: false, error: err?.message || "unknown" };
      }
    }

    console.log("[Google Provision] Final results:", JSON.stringify(results));

    return NextResponse.json({
      requestedFeatures,
      googleEmail,
      keycloakEmail,
      ...results,
    });
  } catch (error: any) {
    console.error("[Google Provision] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
