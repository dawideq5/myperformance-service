/**
 * Pure helpers for the account calendar tab — date parsers, event normalisers,
 * grid math, and payload builders. Extracted from CalendarTab.tsx to keep the
 * component focused on rendering & state orchestration.
 *
 * NOTE: the existing `app/account/calendar-service.ts` holds the API client
 * facade (`calendarService.list/create/update/...`); this module is the
 * complementary "pure side" — no side effects, no fetch.
 */

import type { CalendarEvent } from "@/app/account/types";
import type { CalendarEventInput } from "@/app/account/calendar-service";
import type { KadromierzShift } from "@/app/account/account-service";

export type EventTarget = "local" | "google" | "moodle";

export interface EventFormState {
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  target: EventTarget;
}

export const EMPTY_FORM: EventFormState = {
  title: "",
  description: "",
  start: "",
  end: "",
  allDay: false,
  location: "",
  target: "local",
};

export const KADROMIERZ_COLOR = "#F97316";
export const MOODLE_COLOR = "#F59E0B";

export const WEEKDAYS_PL = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
export const MONTHS_PL = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toLocalDatetimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toLocalDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseEventDate(
  event: CalendarEvent,
  which: "start" | "end",
): Date {
  const raw = which === "start" ? event.startDate : event.endDate;
  if (event.allDay) {
    const d = raw.split("T")[0];
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, (m || 1) - 1, day || 1);
  }
  return new Date(raw);
}

export function sameYMD(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// When the allDay toggle flips, rewrite the stored string so the <input>
// can still parse it: `datetime-local` needs `YYYY-MM-DDTHH:mm`, `date` needs
// `YYYY-MM-DD`. Without this, toggling OFF leaves the input empty and the
// user hits validation errors they can't see.
export function normalizeBoundaryForAllDay(
  value: string,
  allDay: boolean,
): string {
  if (!value) return value;
  if (allDay) return value.slice(0, 10);
  return value.includes("T") ? value : `${value.slice(0, 10)}T09:00`;
}

export function buildPayload(form: EventFormState): CalendarEventInput {
  const { title, description, start, end, allDay, location } = form;
  // Moodle needs absolute datetimes so server-side epoch math is unambiguous;
  // normalise all-day to UTC midnight of the selected date.
  if (allDay) {
    const [startY, startM, startD] = start.split("-").map(Number);
    const [endY, endM, endD] = end.split("-").map(Number);
    const startDate = new Date(
      Date.UTC(startY, (startM || 1) - 1, startD || 1, 0, 0, 0),
    );
    const endDate = new Date(
      Date.UTC(endY, (endM || 1) - 1, endD || 1, 23, 59, 59),
    );
    return {
      title: title.trim(),
      description: description.trim() || undefined,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      allDay,
      location: location.trim() || undefined,
    };
  }
  return {
    title: title.trim(),
    description: description.trim() || undefined,
    startDate: new Date(start).toISOString(),
    endDate: new Date(end).toISOString(),
    allDay,
    location: location.trim() || undefined,
  };
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (a, b) =>
      parseEventDate(a, "start").getTime() -
      parseEventDate(b, "start").getTime(),
  );
}

export function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const chosen = new Map<string, CalendarEvent>();

  for (const event of events) {
    const key = event.googleEventId
      ? `google:${event.googleEventId}`
      : `id:${event.id}`;
    const current = chosen.get(key);
    if (!current) {
      chosen.set(key, event);
      continue;
    }

    const currentScore = current.source === "google" ? 0 : 1;
    const nextScore = event.source === "google" ? 0 : 1;
    if (nextScore > currentScore) {
      chosen.set(key, event);
    }
  }

  return sortEvents(Array.from(chosen.values()));
}

export function initialFormForEvent(event: CalendarEvent): EventFormState {
  const start = parseEventDate(event, "start");
  const end = parseEventDate(event, "end");
  const target: EventTarget =
    event.source === "moodle"
      ? "moodle"
      : event.source === "google" || !!event.googleEventId
        ? "google"
        : "local";
  return {
    title: event.title,
    description: event.description ?? "",
    start: event.allDay ? toLocalDateValue(start) : toLocalDatetimeValue(start),
    end: event.allDay ? toLocalDateValue(end) : toLocalDatetimeValue(end),
    allDay: event.allDay,
    location: event.location ?? "",
    target,
  };
}

export function initialFormForDay(
  day: Date,
  defaultTarget: EventTarget = "local",
): EventFormState {
  const now = new Date();
  const start = new Date(day);
  start.setHours(now.getHours(), 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    ...EMPTY_FORM,
    target: defaultTarget,
    start: toLocalDatetimeValue(start),
    end: toLocalDatetimeValue(end),
  };
}

export function buildMonthGrid(viewDate: Date): Date[] {
  const firstOfMonth = new Date(
    viewDate.getFullYear(),
    viewDate.getMonth(),
    1,
  );
  // Monday = 0
  const dow = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - dow);
  const grid: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    grid.push(d);
  }
  return grid;
}

export function groupEventsByDay(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const start = parseEventDate(ev, "start");
    const end = parseEventDate(ev, "end");
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const lastDay = new Date(end);
    lastDay.setHours(0, 0, 0, 0);
    // For all-day events in Google iCal style, end is exclusive. Treat spans > 1 day by stepping inclusive.
    while (cursor.getTime() <= lastDay.getTime()) {
      const key = dayKey(cursor);
      const list = map.get(key) ?? [];
      if (!list.find((e) => e.id === ev.id)) list.push(ev);
      map.set(key, list);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return map;
}

// Returns the 6-week grid boundaries (Monday-based) for the month containing
// `viewDate`. We resync external sources for that exact window — so a user
// clicking "next month" sees live data for the new grid, not stale caches.
export function monthGridBounds(viewDate: Date): { from: Date; to: Date } {
  const firstOfMonth = new Date(
    viewDate.getFullYear(),
    viewDate.getMonth(),
    1,
  );
  const dow = (firstOfMonth.getDay() + 6) % 7;
  const from = new Date(firstOfMonth);
  from.setDate(firstOfMonth.getDate() - dow);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 42);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// Kadromierz shifts are read-only projections — render as calendar events
// so they layer into the existing grid without persisting anywhere.
export function shiftsToEvents(shifts: KadromierzShift[]): CalendarEvent[] {
  return shifts
    .map((shift): CalendarEvent | null => {
      const datePart = shift.date?.slice(0, 10);
      if (!datePart) return null;
      // API may return full datetime strings or HH:MM — normalise.
      const ensureIso = (value: string) => {
        if (!value) return value;
        if (value.includes("T")) return value;
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) {
          return value.replace(" ", "T");
        }
        if (/^\d{2}:\d{2}/.test(value)) {
          return `${datePart}T${value.slice(0, 5)}:00`;
        }
        return value;
      };
      const start = ensureIso(shift.start);
      const end = ensureIso(shift.end);
      if (!start || !end) return null;
      return {
        id: `kadromierz_${shift.id}`,
        title: shift.position
          ? `Zmiana · ${shift.position}`
          : "Zmiana Kadromierz",
        startDate: start,
        endDate: end,
        allDay: false,
        source: "kadromierz",
        color: KADROMIERZ_COLOR,
        readOnly: true,
      };
    })
    .filter((e): e is CalendarEvent => e !== null);
}

// Treat any event carrying a googleEventId as synced-to-Google. A manual
// event that POSTed successfully to Google picks up a googleEventId before
// the local state refreshes, so the badge lights up the moment we save —
// no page reload needed.
export function isSyncedToGoogle(event: CalendarEvent): boolean {
  return event.source === "google" || !!event.googleEventId;
}

export function isKadromierz(event: CalendarEvent): boolean {
  return event.source === "kadromierz";
}

export function isMoodle(event: CalendarEvent): boolean {
  return event.source === "moodle";
}

export function eventStripeColor(event: CalendarEvent): string {
  return (
    event.color ||
    (isKadromierz(event)
      ? KADROMIERZ_COLOR
      : isMoodle(event)
        ? MOODLE_COLOR
        : isSyncedToGoogle(event)
          ? "#4285F4"
          : "var(--accent)")
  );
}
