import { keycloak } from "@/lib/keycloak";

export interface GoogleWatchState {
  channelId: string;
  resourceId: string;
  channelToken: string;
  expiry: number; // epoch ms
  syncToken?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export function readSingleAttr(
  attrs: Record<string, string[]> | undefined,
  key: string,
): string | undefined {
  const v = attrs?.[key]?.[0];
  return v && v.length > 0 ? v : undefined;
}

export function readWatchState(
  attrs: Record<string, string[]> | undefined,
): GoogleWatchState | null {
  const channelId = readSingleAttr(attrs, "google_cal_channel_id");
  const resourceId = readSingleAttr(attrs, "google_cal_resource_id");
  const channelToken = readSingleAttr(attrs, "google_cal_channel_token");
  const expiryRaw = readSingleAttr(attrs, "google_cal_channel_expiry");
  if (!channelId || !resourceId || !channelToken || !expiryRaw) return null;
  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry)) return null;
  return {
    channelId,
    resourceId,
    channelToken,
    expiry,
    syncToken: readSingleAttr(attrs, "google_cal_sync_token"),
  };
}

/**
 * Uses a stored refresh token to mint a fresh Google access token.
 * Requires GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (the Google Cloud
 * OAuth client that Keycloak's broker is also configured against).
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<string> {
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
    process.env.GOOGLE_IDP_CLIENT_ID?.trim();
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_IDP_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_IDP_CLIENT_ID / GOOGLE_IDP_CLIENT_SECRET are not configured",
    );
  }
  const resp = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Failed to refresh Google access token: ${resp.status} ${txt}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error("No access_token in refresh response");
  return String(data.access_token);
}

/**
 * Calls `calendars/primary/events/watch` to register a push channel.
 */
export async function registerWatchChannel(params: {
  accessToken: string;
  channelId: string;
  channelToken: string;
  webhookUrl: string;
  // Max 30 days from docs; pick 7 days.
  ttlMs?: number;
}): Promise<{ resourceId: string; expiration: number }> {
  const ttl = params.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
  const body = {
    id: params.channelId,
    type: "web_hook",
    address: params.webhookUrl,
    token: params.channelToken,
    expiration: String(Date.now() + ttl),
  };
  const resp = await fetch(`${CALENDAR_API}/calendars/primary/events/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`watch failed: ${resp.status} ${txt}`);
  }
  const data = await resp.json();
  if (!data.resourceId || !data.expiration) {
    throw new Error("watch response missing resourceId/expiration");
  }
  return {
    resourceId: String(data.resourceId),
    expiration: Number(data.expiration),
  };
}

export async function stopWatchChannel(params: {
  accessToken: string;
  channelId: string;
  resourceId: string;
}): Promise<void> {
  await fetch(`${CALENDAR_API}/channels/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: params.channelId, resourceId: params.resourceId }),
  }).catch(() => {
    /* best effort */
  });
}

/**
 * Incremental events list. If syncToken is provided, returns only changes since.
 * Otherwise returns primed baseline and a fresh nextSyncToken.
 */
export async function listEventsIncremental(params: {
  accessToken: string;
  syncToken?: string;
}): Promise<{
  items: GoogleCalendarEvent[];
  nextSyncToken?: string;
  gone: boolean; // true if syncToken was invalidated (410) and caller must re-prime
}> {
  const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
  if (params.syncToken) {
    url.searchParams.set("syncToken", params.syncToken);
  } else {
    const now = new Date();
    url.searchParams.set("timeMin", now.toISOString());
    url.searchParams.set(
      "timeMax",
      new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    );
  }
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "250");

  const items: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  while (true) {
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    else url.searchParams.delete("pageToken");

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    if (resp.status === 410) {
      return { items: [], gone: true };
    }
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`events.list failed: ${resp.status} ${txt}`);
    }
    const data = await resp.json();
    for (const it of data.items ?? []) items.push(it as GoogleCalendarEvent);
    nextSyncToken = data.nextSyncToken;
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { items, nextSyncToken, gone: false };
}

/**
 * Merges a Google event list into the stored events, respecting cancellations.
 * Preserves manual (source="manual") events.
 */
export function mergeGoogleEvents(
  existing: Array<{
    id: string;
    source: "manual" | "google";
    googleEventId?: string;
  }>,
  incoming: GoogleCalendarEvent[],
): {
  removedIds: string[];
  upserts: Array<{
    id: string;
    title: string;
    description?: string;
    startDate: string;
    endDate: string;
    allDay: boolean;
    source: "google";
    googleEventId: string;
    color: string;
    location?: string;
  }>;
} {
  const removedIds: string[] = [];
  const upserts: ReturnType<typeof mergeGoogleEvents>["upserts"] = [];
  const existingByGoogleId = new Map(
    existing
      .filter((e) => e.source === "google" && e.googleEventId)
      .map((e) => [e.googleEventId as string, e.id] as const),
  );

  for (const item of incoming) {
    if (item.status === "cancelled") {
      const localId = existingByGoogleId.get(item.id);
      if (localId) removedIds.push(localId);
      continue;
    }
    const start = item.start?.dateTime || item.start?.date;
    const end = item.end?.dateTime || item.end?.date;
    if (!start || !end) continue;
    const allDay = !item.start?.dateTime;
    upserts.push({
      id: `google_${item.id}`,
      title: item.summary || "(Bez tytułu)",
      description: item.description || undefined,
      startDate: start,
      endDate: end,
      allDay,
      source: "google",
      googleEventId: item.id,
      color: "#4285F4",
      location: item.location || undefined,
    });
  }

  return { removedIds, upserts };
}

export function getWebhookPublicUrl(): string | null {
  const raw = (
    process.env.PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).trim();
  if (!raw) return null;
  if (!/^https:\/\//i.test(raw)) return null; // Google requires HTTPS
  return `${raw.replace(/\/$/, "")}/api/webhooks/google-calendar`;
}

export async function getFreshGoogleAccessTokenForUser(
  userAccessToken: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const tokens = await keycloak.getBrokerTokens(userAccessToken, "google");
  return {
    access_token: String(tokens.access_token ?? ""),
    refresh_token: tokens.refresh_token ? String(tokens.refresh_token) : undefined,
  };
}
