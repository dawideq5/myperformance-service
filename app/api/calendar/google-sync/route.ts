import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import type { CalendarEvent } from "../events/route";

/**
 * POST /api/calendar/google-sync
 * Fetches upcoming Google Calendar events (next 30 days) and merges them
 * with the user's local calendar events stored in Keycloak attributes.
 * Events from Google are stored with source="google" so they can be distinguished.
 */
export async function POST() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let googleTokens: Record<string, any>;
    try {
      googleTokens = await keycloak.getBrokerTokens(session.accessToken, "google");
    } catch {
      return NextResponse.json({ error: "Google account not connected" }, { status: 400 });
    }

    const googleAccessToken: string | undefined = googleTokens.access_token;
    if (!googleAccessToken) {
      return NextResponse.json({ error: "Google access token unavailable" }, { status: 400 });
    }

    const now = new Date();
    const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const calUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    calUrl.searchParams.set("timeMin", now.toISOString());
    calUrl.searchParams.set("timeMax", future.toISOString());
    calUrl.searchParams.set("singleEvents", "true");
    calUrl.searchParams.set("orderBy", "startTime");
    calUrl.searchParams.set("maxResults", "50");

    const calResp = await fetch(calUrl.toString(), {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!calResp.ok) {
      const errText = await calResp.text();
      console.error("[Calendar Google Sync] Failed:", calResp.status, errText);
      
      if (calResp.status === 401) {
        // 409 (not 401): user's NextAuth session is fine; only the linked
        // Google broker token needs re-consent. A 401 here would trigger the
        // global unauthorized handler and sign the user out of the whole app.
        return NextResponse.json(
          { error: "Google token expired. Please reconnect your Google account.", needsReconnect: true },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: "Failed to fetch Google Calendar events" },
        { status: 502 }
      );
    }

    const calData = await calResp.json();
    const googleItems: any[] = calData.items || [];

    const googleEvents: CalendarEvent[] = googleItems
      .filter((item) => item.status !== "cancelled")
      .map((item) => ({
        id: `google_${item.id}`,
        title: item.summary || "(Bez tytułu)",
        description: item.description || undefined,
        startDate: item.start?.dateTime || item.start?.date || now.toISOString(),
        endDate: item.end?.dateTime || item.end?.date || now.toISOString(),
        allDay: !item.start?.dateTime,
        source: "google" as const,
        googleEventId: item.id,
        location: item.location || undefined,
        color: "#4285F4",
      }));

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
    const userData = userResp.ok ? await userResp.json() : {};
    const rawEvents: string[] = userData.attributes?.calendar_events || [];
    const existingEvents: CalendarEvent[] = rawEvents.flatMap((raw) => {
      try {
        return [JSON.parse(raw) as CalendarEvent];
      } catch {
        return [];
      }
    });

    // Keep all local events (they're the source of truth)
    const localEvents = existingEvents.filter((e) => e.source === "manual");
    // Add Google events that are not already represented by local events
    const newGoogleEvents = googleEvents.filter((ge) => !localEvents.find((le) => le.googleEventId === ge.googleEventId));
    const merged = [...localEvents, ...newGoogleEvents];

    await keycloak.updateUserAttributes(serviceToken, userId, {
      calendar_events: merged.map((e) => JSON.stringify(e)),
      calendar_google_synced_at: [new Date().toISOString()],
    });

    return NextResponse.json({
      synced: googleEvents.length,
      total: merged.length,
      events: merged.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    });
  } catch (error) {
    console.error("[Calendar Google Sync]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
