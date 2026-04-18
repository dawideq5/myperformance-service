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
}

export const calendarService = {
  list: () => api.get<{ events: CalendarEvent[] }>("/api/calendar/events"),

  create: (payload: CalendarEventInput) =>
    api.post<CreateEventResponse, CalendarEventInput>(
      "/api/calendar/events",
      payload,
    ),

  update: (id: string, payload: CalendarEventInput) =>
    api.put<UpdateEventResponse, CalendarEventInput>(
      `/api/calendar/events/${encodeURIComponent(id)}`,
      payload,
    ),

  delete: (id: string) =>
    api.delete<void>(`/api/calendar/events/${encodeURIComponent(id)}`),

  syncGoogle: () =>
    api.post<GoogleSyncResponse>("/api/calendar/google-sync"),
};
