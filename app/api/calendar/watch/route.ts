import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  encryptSecret,
  generateChannelToken,
  isWebhookSecretConfigured,
  signChannelId,
} from "@/lib/calendar-webhook";
import {
  getFreshGoogleAccessTokenForUser,
  getWebhookPublicUrl,
  readWatchState,
  registerWatchChannel,
  stopWatchChannel,
} from "@/lib/google-calendar";

const MIN_REMAINING_MS = 24 * 60 * 60 * 1000; // renew when <24h left

/**
 * POST /api/calendar/watch
 *   - Ensures a healthy Google Calendar push channel exists for the user.
 *   - Registers new channel if none; renews if <24h remaining.
 *   - Idempotent: safe to call on every calendar mount.
 *
 * Returns { ok: true, status: "registered"|"renewed"|"healthy"|"skipped" } or
 * { ok: false, reason: "..." } when configuration is missing.
 */
export async function POST() {
  const session: any = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWebhookSecretConfigured()) {
    return NextResponse.json({ ok: false, reason: "signing_secret_missing" });
  }
  const webhookUrl = getWebhookPublicUrl();
  if (!webhookUrl) {
    return NextResponse.json({ ok: false, reason: "public_url_missing" });
  }

  let googleTokens: { access_token: string; refresh_token?: string };
  try {
    googleTokens = await getFreshGoogleAccessTokenForUser(session.accessToken);
  } catch {
    return NextResponse.json({ ok: false, reason: "google_not_connected" });
  }
  if (!googleTokens.access_token) {
    return NextResponse.json({ ok: false, reason: "google_not_connected" });
  }

  const userId = await keycloak.getUserIdFromToken(session.accessToken);
  const serviceToken = await keycloak.getServiceAccountToken();
  const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
  if (!userResp.ok) {
    return NextResponse.json(
      { error: "Failed to read user attributes" },
      { status: 500 },
    );
  }
  const userData = await userResp.json();
  const attrs: Record<string, string[]> = userData.attributes || {};
  const existing = readWatchState(attrs);
  const now = Date.now();

  // Healthy: still far from expiry → no-op
  if (existing && existing.expiry - now > MIN_REMAINING_MS) {
    return NextResponse.json({ ok: true, status: "healthy" });
  }

  // If expiring soon, stop the old channel first (best-effort)
  if (existing) {
    await stopWatchChannel({
      accessToken: googleTokens.access_token,
      channelId: existing.channelId,
      resourceId: existing.resourceId,
    });
  }

  const channelId = signChannelId(userId);
  const channelToken = generateChannelToken();

  let registered: { resourceId: string; expiration: number };
  try {
    registered = await registerWatchChannel({
      accessToken: googleTokens.access_token,
      channelId,
      channelToken,
      webhookUrl,
    });
  } catch (err) {
    console.error("[calendar/watch] register failed:", err);
    return NextResponse.json(
      { ok: false, reason: "register_failed" },
      { status: 502 },
    );
  }

  const attrUpdate: Record<string, string[]> = {
    google_cal_channel_id: [channelId],
    google_cal_resource_id: [registered.resourceId],
    google_cal_channel_token: [channelToken],
    google_cal_channel_expiry: [String(registered.expiration)],
  };
  if (googleTokens.refresh_token) {
    attrUpdate.google_cal_refresh_token_enc = [
      encryptSecret(googleTokens.refresh_token),
    ];
  }

  await keycloak.updateUserAttributes(serviceToken, userId, attrUpdate);

  return NextResponse.json({
    ok: true,
    status: existing ? "renewed" : "registered",
    expiry: registered.expiration,
  });
}

/**
 * DELETE /api/calendar/watch — stop the user's watch channel.
 */
export async function DELETE() {
  const session: any = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await keycloak.getUserIdFromToken(session.accessToken);
  const serviceToken = await keycloak.getServiceAccountToken();
  const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
  if (!userResp.ok) return NextResponse.json({ ok: true });
  const userData = await userResp.json();
  const attrs: Record<string, string[]> = userData.attributes || {};
  const existing = readWatchState(attrs);
  if (!existing) return NextResponse.json({ ok: true });

  try {
    const google = await getFreshGoogleAccessTokenForUser(session.accessToken);
    if (google.access_token) {
      await stopWatchChannel({
        accessToken: google.access_token,
        channelId: existing.channelId,
        resourceId: existing.resourceId,
      });
    }
  } catch {
    /* best effort */
  }

  await keycloak.updateUserAttributes(serviceToken, userId, {
    google_cal_channel_id: [],
    google_cal_resource_id: [],
    google_cal_channel_token: [],
    google_cal_channel_expiry: [],
    google_cal_sync_token: [],
  });

  return NextResponse.json({ ok: true });
}
