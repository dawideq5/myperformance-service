import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { randomUUID } from "crypto";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  source: "manual" | "google";
  googleEventId?: string;
  color?: string;
  location?: string;
}

async function getEventsFromKeycloak(serviceToken: string, userId: string): Promise<CalendarEvent[]> {
  const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
  if (!userResp.ok) return [];
  const userData = await userResp.json();
  const rawEvents: string[] = userData.attributes?.calendar_events || [];
  return rawEvents.flatMap((raw) => {
    try {
      return [JSON.parse(raw) as CalendarEvent];
    } catch {
      return [];
    }
  });
}

async function saveEventsToKeycloak(serviceToken: string, userId: string, events: CalendarEvent[]) {
  await keycloak.updateUserAttributes(serviceToken, userId, {
    calendar_events: events.map((e) => JSON.stringify(e)),
  });
}

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();
    const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);

    if (!userResp.ok) {
      return NextResponse.json({ events: [] });
    }

    const userData = await userResp.json();
    const rawEvents: string[] = userData.attributes?.calendar_events || [];

    const events = rawEvents.flatMap((raw) => {
      try {
        return [JSON.parse(raw) as CalendarEvent];
      } catch {
        return [];
      }
    });

    events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[Calendar Events GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { title, description, startDate, endDate, allDay, color, location } = body;

    if (!title || !startDate || !endDate) {
      return NextResponse.json({ error: "title, startDate and endDate are required" }, { status: 400 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    let googleEventId: string | undefined;
    let googleSynced = false;

    // Try to sync to Google Calendar if connected
    try {
      const googleTokens = await keycloak.getBrokerTokens(session.accessToken, "google");
      const googleAccessToken = googleTokens.access_token;

      if (googleAccessToken) {
        const googleEvent = {
          summary: String(title).slice(0, 200),
          description: description ? String(description).slice(0, 1000) : undefined,
          start: {
            dateTime: allDay ? undefined : String(startDate),
            date: allDay ? String(startDate).split('T')[0] : undefined,
          },
          end: {
            dateTime: allDay ? undefined : String(endDate),
            date: allDay ? String(endDate).split('T')[0] : undefined,
          },
          location: location ? String(location).slice(0, 200) : undefined,
        };

        const calResp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(googleEvent),
        });

        if (calResp.ok) {
          const calData = await calResp.json();
          googleEventId = calData.id;
          googleSynced = true;
        }
      }
    } catch {
      // Best-effort; local create still proceeds.
    }

    const newEvent: CalendarEvent = {
      id: randomUUID(),
      title: String(title).slice(0, 200),
      description: description ? String(description).slice(0, 1000) : undefined,
      startDate: String(startDate),
      endDate: String(endDate),
      allDay: Boolean(allDay),
      source: "manual",
      googleEventId,
      color: color ? String(color) : undefined,
      location: location ? String(location).slice(0, 200) : undefined,
    };

    const events = await getEventsFromKeycloak(serviceToken, userId);
    events.push(newEvent);
    await saveEventsToKeycloak(serviceToken, userId, events);

    return NextResponse.json({ event: newEvent, googleSynced }, { status: 201 });
  } catch (error) {
    console.error("[Calendar Events POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
