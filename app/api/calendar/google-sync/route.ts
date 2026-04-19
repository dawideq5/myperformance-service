import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { shiftDateString } from "@/lib/google-calendar";
import type { CalendarEvent } from "../events/route";

/**
 * POST /api/calendar/google-sync
 * Fetches Google Calendar events (past 30 days + next 180 days) across all
 * pages and merges them with the user's local events stored in Keycloak
 * attributes. Local (manual) events remain the source of truth; Google
 * events are stored with source="google" and an inclusive end date.
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
    const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const future = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

    const baseUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    baseUrl.searchParams.set("timeMin", past.toISOString());
    baseUrl.searchParams.set("timeMax", future.toISOString());
    baseUrl.searchParams.set("singleEvents", "true");
    baseUrl.searchParams.set("orderBy", "startTime");
    baseUrl.searchParams.set("maxResults", "250");

    const googleItems: any[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(baseUrl.toString());
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const calResp = await fetch(url.toString(), {
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
      for (const it of calData.items ?? []) googleItems.push(it);
      pageToken = calData.nextPageToken;
    } while (pageToken);

    const googleEvents: CalendarEvent[] = googleItems
      .filter((item) => item.status !== "cancelled")
      .map((item) => {
        const allDay = !item.start?.dateTime;
        const startRaw: string =
          item.start?.dateTime || item.start?.date || now.toISOString();
        let endRaw: string =
          item.end?.dateTime || item.end?.date || now.toISOString();
        if (allDay && item.end?.date) {
          endRaw = shiftDateString(endRaw, -1);
        }
        return {
          id: `google_${item.id}`,
          title: item.summary || "(Bez tytułu)",
          description: item.description || undefined,
          startDate: startRaw,
          endDate: endRaw,
          allDay,
          source: "google" as const,
          googleEventId: item.id,
          location: item.location || undefined,
          color: "#4285F4",
        };
      });

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

    const localEvents = existingEvents.filter((e) => e.source === "manual");
    const newGoogleEvents = googleEvents.filter(
      (ge) => !localEvents.find((le) => le.googleEventId === ge.googleEventId),
    );
    const merged = [...localEvents, ...newGoogleEvents];

    await keycloak.updateUserAttributes(serviceToken, userId, {
      calendar_events: merged.map((e) => JSON.stringify(e)),
      calendar_google_synced_at: [new Date().toISOString()],
    });

    return NextResponse.json({
      synced: googleEvents.length,
      total: merged.length,
      events: merged.sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      ),
    });
  } catch (error) {
    console.error("[Calendar Google Sync]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
