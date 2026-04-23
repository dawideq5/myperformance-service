import { api } from "@/lib/api-client";
import type { CalendarEvent } from "./types";

export interface CalendarEventInput {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  location?: string;
}

export interface CreateEventResponse {
  event: CalendarEvent;
  googleSynced?: boolean;
}

export interface UpdateEventResponse {
  event: CalendarEvent;
}

export interface GoogleSyncResponse {
  synced: number;
  total: number;
  events: CalendarEvent[];
  needsReconnect?: boolean;
  reason?: string;
  persisted?: boolean;
}

export interface MoodleEventInput {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  location?: string;
}

export const calendarService = {
  list: () => api.get<{ events: CalendarEvent[] }>("/api/calendar/events"),

  create: (payload: CalendarEventInput & { target?: "local" | "moodle" }) => {
    if (payload.target === "moodle") {
      const { target: _t, ...rest } = payload;
      return api.post<CreateEventResponse, CalendarEventInput>(
        "/api/integrations/moodle/events",
        rest,
      );
    }
    const { target: _t, ...rest } = payload;
    return api.post<CreateEventResponse, CalendarEventInput>(
      "/api/calendar/events",
      rest,
    );
  },

  update: (id: string, payload: CalendarEventInput) => {
    if (id.startsWith("moodle_")) {
      const moodleId = Number(id.slice("moodle_".length));
      return api.put<UpdateEventResponse, MoodleEventInput & { id: number }>(
        "/api/integrations/moodle/events",
        { id: moodleId, ...payload },
      );
    }
    return api.put<UpdateEventResponse, CalendarEventInput>(
      `/api/calendar/events/${encodeURIComponent(id)}`,
      payload,
    );
  },

  delete: (id: string) => {
    if (id.startsWith("moodle_")) {
      const moodleId = Number(id.slice("moodle_".length));
      return api.delete<void>(
        `/api/integrations/moodle/events?id=${moodleId}`,
      );
    }
    return api.delete<void>(
      `/api/calendar/events/${encodeURIComponent(id)}`,
    );
  },

  /**
   * Fetch Google events for a specific month window without persisting to
   * Keycloak (live read). Falls back to the full persisted baseline when
   * called without args.
   */
  syncGoogle: (range?: { from?: string; to?: string; persist?: boolean }) =>
    api.post<GoogleSyncResponse, Record<string, unknown>>(
      "/api/calendar/google-sync",
      range ?? {},
    ),

  fetchMoodleEvents: (range?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (range?.from) qs.set("from", range.from);
    if (range?.to) qs.set("to", range.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<{ events: CalendarEvent[] }>(
      `/api/integrations/moodle/events${suffix}`,
    );
  },

  ensureWatch: () =>
    api.post<{ ok: boolean; status?: string; reason?: string }>(
      "/api/calendar/watch",
    ),
};
