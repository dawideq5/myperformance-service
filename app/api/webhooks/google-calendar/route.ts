import { NextRequest, NextResponse } from "next/server";
import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";
import {
  decryptSecret,
  isWebhookSecretConfigured,
  verifyChannelId,
} from "@/lib/calendar-webhook";
import {
  listEventsIncremental,
  mergeGoogleEvents,
  readSingleAttr,
  refreshGoogleAccessToken,
} from "@/lib/google-calendar";
import type { CalendarEvent } from "@/app/api/calendar/events/route";

/**
 * POST /api/webhooks/google-calendar
 *
 * Google sends a notification with an empty body and these headers:
 *   - X-Goog-Channel-ID     (our signed channel ID → resolves userId)
 *   - X-Goog-Channel-Token  (the random token we stored on registration)
 *   - X-Goog-Resource-ID    (opaque Google resource reference)
 *   - X-Goog-Resource-State (sync | exists | not_exists)
 *
 * Handler must respond quickly; we do the sync inline but time-box via a single API round-trip.
 */
export async function POST(request: NextRequest) {
  if (!isWebhookSecretConfigured()) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const channelId = request.headers.get("x-goog-channel-id");
  const channelToken = request.headers.get("x-goog-channel-token");
  const resourceState = request.headers.get("x-goog-resource-state");

  if (!channelId || !channelToken || !resourceState) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // "sync" is Google's initial handshake — ack with 200 and do nothing.
  if (resourceState === "sync") {
    return NextResponse.json({ ok: true });
  }

  const userId = verifyChannelId(channelId);
  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const serviceToken = await keycloak.getServiceAccountToken();
  const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
  if (!userResp.ok) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const userData = await userResp.json();
  const attrs: Record<string, string[]> = userData.attributes || {};

  const storedToken = readSingleAttr(attrs, "google_cal_channel_token");
  if (!storedToken || storedToken !== channelToken) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const encRefresh = readSingleAttr(attrs, "google_cal_refresh_token_enc");
  if (!encRefresh) {
    // Can't sync server-side without a refresh token. Ack anyway so Google stops retrying.
    return NextResponse.json({ ok: true, skipped: "no_refresh_token" });
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(encRefresh);
  } catch {
    return NextResponse.json({ ok: true, skipped: "decrypt_failed" });
  }

  let accessToken: string;
  try {
    accessToken = await refreshGoogleAccessToken(refreshToken);
  } catch (err) {
    log.warn("calendar.webhook.refresh_failed", { err });
    return NextResponse.json({ ok: true, skipped: "refresh_failed" });
  }

  const syncToken = readSingleAttr(attrs, "google_cal_sync_token");
  let incremental = await listEventsIncremental({ accessToken, syncToken });
  if (incremental.gone) {
    // syncToken invalidated — re-prime with full list
    incremental = await listEventsIncremental({ accessToken });
  }

  const rawEvents: string[] = attrs.calendar_events || [];
  const existing: CalendarEvent[] = rawEvents.flatMap((raw) => {
    try {
      return [JSON.parse(raw) as CalendarEvent];
    } catch {
      return [];
    }
  });

  const { removedIds, upserts } = mergeGoogleEvents(existing, incremental.items);

  const byId = new Map(existing.map((e) => [e.id, e] as const));
  for (const id of removedIds) byId.delete(id);
  for (const u of upserts) byId.set(u.id, u);
  const merged = Array.from(byId.values());

  const updates: Record<string, string[]> = {
    calendar_events: merged.map((e) => JSON.stringify(e)),
  };
  if (incremental.nextSyncToken) {
    updates.google_cal_sync_token = [incremental.nextSyncToken];
  }
  await keycloak.updateUserAttributes(serviceToken, userId, updates);

  return NextResponse.json({ ok: true, changed: upserts.length + removedIds.length });
}
