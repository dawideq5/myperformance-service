import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import type { CalendarEvent } from "../route";

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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    console.log("[Calendar Events DELETE] User ID:", userId);
    
    const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
    console.log("[Calendar Events DELETE] Keycloak user response status:", userResp.status);
    if (!userResp.ok) {
      const errorText = await userResp.text();
      console.error("[Calendar Events DELETE] Keycloak error:", errorText);
      return NextResponse.json({ error: "Failed to fetch user data" }, { status: 500 });
    }
    
    const userData = await userResp.json();
    const rawEvents: string[] = userData.attributes?.calendar_events || [];
    console.log("[Calendar Events DELETE] Raw events from Keycloak:", rawEvents);
    
    const events = rawEvents.flatMap((raw) => {
      try {
        return [JSON.parse(raw) as CalendarEvent];
      } catch {
        return [];
      }
    });
    
    console.log("[Calendar Events DELETE] Looking for event with ID:", id);
    console.log("[Calendar Events DELETE] Available event IDs:", events.map(e => e.id));
    const eventToDelete = events.find((e) => e.id === id);

    if (!eventToDelete) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // If synced to Google, delete from Google Calendar
    if (eventToDelete.googleEventId) {
      try {
        const googleTokens = await keycloak.getBrokerTokens(session.accessToken, "google");
        const googleAccessToken = googleTokens.access_token;

        if (googleAccessToken) {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventToDelete.googleEventId}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${googleAccessToken}` },
            }
          );
          console.log("[Calendar Events DELETE] Deleted from Google:", eventToDelete.googleEventId);
        }
      } catch (error) {
        console.warn("[Calendar Events DELETE] Failed to delete from Google:", error);
        // Continue with local deletion
      }
    }

    const filtered = events.filter((e) => e.id !== id);
    await saveEventsToKeycloak(serviceToken, userId, filtered);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Calendar Events DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { title, description, startDate, endDate, allDay, color, location } = body;

    if (!title || !startDate || !endDate) {
      return NextResponse.json({ error: "title, startDate and endDate are required" }, { status: 400 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    const events = await getEventsFromKeycloak(serviceToken, userId);
    const eventIndex = events.findIndex((e) => e.id === id);

    if (eventIndex === -1) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const updatedEvent: CalendarEvent = {
      ...events[eventIndex],
      title: String(title).slice(0, 200),
      description: description ? String(description).slice(0, 1000) : undefined,
      startDate: String(startDate),
      endDate: String(endDate),
      allDay: Boolean(allDay),
      color: color ? String(color) : undefined,
      location: location ? String(location).slice(0, 200) : undefined,
    };

    // If synced to Google, update in Google Calendar
    if (updatedEvent.googleEventId) {
      try {
        const googleTokens = await keycloak.getBrokerTokens(session.accessToken, "google");
        const googleAccessToken = googleTokens.access_token;

        if (googleAccessToken) {
          const googleEvent = {
            summary: updatedEvent.title,
            description: updatedEvent.description,
            start: {
              dateTime: allDay ? undefined : updatedEvent.startDate,
              date: allDay ? updatedEvent.startDate.split('T')[0] : undefined,
            },
            end: {
              dateTime: allDay ? undefined : updatedEvent.endDate,
              date: allDay ? updatedEvent.endDate.split('T')[0] : undefined,
            },
            location: updatedEvent.location,
          };

          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${updatedEvent.googleEventId}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${googleAccessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(googleEvent),
            }
          );
          console.log("[Calendar Events PUT] Updated in Google:", updatedEvent.googleEventId);
        }
      } catch (error) {
        console.warn("[Calendar Events PUT] Failed to update in Google:", error);
        // Continue with local update
      }
    }

    events[eventIndex] = updatedEvent;
    await saveEventsToKeycloak(serviceToken, userId, events);

    return NextResponse.json({ event: updatedEvent });
  } catch (error) {
    console.error("[Calendar Events PUT]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
