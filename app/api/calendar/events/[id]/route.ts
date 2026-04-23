import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { getFreshGoogleAccessTokenForUser, shiftDateString } from "@/lib/google-calendar";
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

/**
 * Resolve an incoming id (may be `google_<googleId>` from the UI) against the
 * stored events. Falls back to matching by `googleEventId` so UI state that's
 * slightly ahead of Keycloak-side storage can still delete/update cleanly.
 */
function findEventIndex(events: CalendarEvent[], id: string): number {
  const directIdx = events.findIndex((e) => e.id === id);
  if (directIdx !== -1) return directIdx;
  const googleId = id.startsWith("google_") ? id.slice("google_".length) : null;
  if (!googleId) return -1;
  return events.findIndex(
    (e) => e.googleEventId === googleId || e.id === googleId,
  );
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

    const userResp = await keycloak.adminRequest(`/users/${userId}`, serviceToken);
    if (!userResp.ok) {
      return NextResponse.json({ error: "Failed to fetch user data" }, { status: 500 });
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
    
    const eventIndex = findEventIndex(events, id);
    let eventToDelete = eventIndex !== -1 ? events[eventIndex] : null;

    // If UI state is ahead of storage, accept a `google_<googleId>` id and
    // still delete from Google. Local state won't change (nothing stored).
    if (!eventToDelete && id.startsWith("google_")) {
      const googleEventId = id.slice("google_".length);
      eventToDelete = {
        id,
        title: "",
        startDate: "",
        endDate: "",
        allDay: false,
        source: "google",
        googleEventId,
      };
    }

    if (!eventToDelete) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // If synced to Google, delete from Google Calendar
    if (eventToDelete.googleEventId) {
      try {
        const googleTokens = await getFreshGoogleAccessTokenForUser(
          session.accessToken,
        );
        const googleAccessToken = googleTokens.access_token;

        if (googleAccessToken) {
          const googleResp = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventToDelete.googleEventId}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${googleAccessToken}` },
            }
          );
          if (!googleResp.ok && googleResp.status !== 404) {
            const errorText = await googleResp.text();
            return NextResponse.json(
              {
                error:
                  errorText ||
                  "Nie udało się usunąć wydarzenia z Google Calendar",
              },
              { status: googleResp.status || 502 },
            );
          }
        } else {
          return NextResponse.json(
            { error: "Google access token unavailable" },
            { status: 400 },
          );
        }
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Nie udało się usunąć wydarzenia z Google Calendar",
          },
          { status: 502 },
        );
      }
    }

    const filtered = events.filter((_, idx) => idx !== eventIndex);
    if (eventIndex !== -1) {
      await saveEventsToKeycloak(serviceToken, userId, filtered);
    }
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
    const eventIndex = findEventIndex(events, id);

    // If UI state is ahead of storage, accept `google_<googleId>` and still
    // forward the edit to Google. Local storage is only updated when we have
    // something to update.
    const googleFallbackId =
      eventIndex === -1 && id.startsWith("google_")
        ? id.slice("google_".length)
        : null;

    if (eventIndex === -1 && !googleFallbackId) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const base: CalendarEvent =
      eventIndex !== -1
        ? events[eventIndex]
        : {
            id,
            title: "",
            startDate: "",
            endDate: "",
            allDay: false,
            source: "google",
            googleEventId: googleFallbackId!,
          };

    const updatedEvent: CalendarEvent = {
      ...base,
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
        const googleTokens = await getFreshGoogleAccessTokenForUser(
          session.accessToken,
        );
        const googleAccessToken = googleTokens.access_token;

        if (googleAccessToken) {
          // Google all-day: inclusive end → exclusive (+1 day).
          const googleEvent = {
            summary: updatedEvent.title,
            description: updatedEvent.description,
            start: {
              dateTime: allDay ? undefined : updatedEvent.startDate,
              date: allDay ? updatedEvent.startDate.split('T')[0] : undefined,
            },
            end: {
              dateTime: allDay ? undefined : updatedEvent.endDate,
              date: allDay
                ? shiftDateString(updatedEvent.endDate.split('T')[0], 1)
                : undefined,
            },
            location: updatedEvent.location,
          };

          const googleResp = await fetch(
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
          if (!googleResp.ok) {
            const errorText = await googleResp.text();
            return NextResponse.json(
              {
                error:
                  errorText ||
                  "Nie udało się zaktualizować wydarzenia w Google Calendar",
              },
              { status: googleResp.status || 502 },
            );
          }
        } else {
          return NextResponse.json(
            { error: "Google access token unavailable" },
            { status: 400 },
          );
        }
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Nie udało się zaktualizować wydarzenia w Google Calendar",
          },
          { status: 502 },
        );
      }
    }

    if (eventIndex !== -1) {
      events[eventIndex] = updatedEvent;
      await saveEventsToKeycloak(serviceToken, userId, events);
    }

    return NextResponse.json({ event: updatedEvent });
  } catch (error) {
    console.error("[Calendar Events PUT]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
