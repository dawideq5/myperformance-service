"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  Input,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import { useAsyncAction } from "@/hooks/useAsyncAction";

import { useAccount } from "../AccountProvider";
import {
  calendarService,
  type CalendarEventInput,
} from "../calendar-service";
import type { CalendarEvent } from "../types";
import { LocationAutocomplete } from "./LocationAutocomplete";

interface EventFormState {
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
}

const EMPTY_FORM: EventFormState = {
  title: "",
  description: "",
  start: "",
  end: "",
  allDay: false,
  location: "",
};

const WEEKDAYS_PL = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
const MONTHS_PL = [
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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalDatetimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseEventDate(event: CalendarEvent, which: "start" | "end"): Date {
  const raw = which === "start" ? event.startDate : event.endDate;
  if (event.allDay) {
    const d = raw.split("T")[0];
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, (m || 1) - 1, day || 1);
  }
  return new Date(raw);
}

function sameYMD(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildPayload(form: EventFormState): CalendarEventInput {
  const { title, description, start, end, allDay, location } = form;
  return {
    title: title.trim(),
    description: description.trim() || undefined,
    startDate: allDay ? start.split("T")[0] : new Date(start).toISOString(),
    endDate: allDay ? end.split("T")[0] : new Date(end).toISOString(),
    allDay,
    location: location.trim() || undefined,
  };
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (a, b) =>
      parseEventDate(a, "start").getTime() -
      parseEventDate(b, "start").getTime(),
  );
}

function initialFormForEvent(event: CalendarEvent): EventFormState {
  const start = parseEventDate(event, "start");
  const end = parseEventDate(event, "end");
  return {
    title: event.title,
    description: event.description ?? "",
    start: event.allDay ? toLocalDateValue(start) : toLocalDatetimeValue(start),
    end: event.allDay ? toLocalDateValue(end) : toLocalDatetimeValue(end),
    allDay: event.allDay,
    location: event.location ?? "",
  };
}

function initialFormForDay(day: Date): EventFormState {
  const now = new Date();
  const start = new Date(day);
  start.setHours(now.getHours(), 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    ...EMPTY_FORM,
    start: toLocalDatetimeValue(start),
    end: toLocalDatetimeValue(end),
  };
}

function buildMonthGrid(viewDate: Date): Date[] {
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

function groupEventsByDay(
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

export function CalendarTab() {
  const { googleStatus } = useAccount();
  const googleConnected = googleStatus?.connected === true;

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  const [viewDate, setViewDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [addOpen, setAddOpen] = useState<Date | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);

  const autoSyncedRef = useRef(false);

  const fetchEvents = useCallback(async () => {
    try {
      const { events: data } = await calendarService.list();
      setEvents(sortEvents(data ?? []));
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return;
      setLoadError(
        err instanceof Error ? err.message : "Nie udało się pobrać wydarzeń",
      );
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  // Silent background sync + watch-channel ensure on first mount when Google is connected.
  // Webhook delivers real-time updates afterward; this is the cold-open fallback.
  useEffect(() => {
    if (!googleConnected || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    (async () => {
      try {
        const result = await calendarService.syncGoogle();
        setEvents(sortEvents(result.events ?? []));
      } catch {
        /* silent; fallback remains existing events */
      }
      try {
        await calendarService.ensureWatch();
      } catch {
        /* non-fatal; auto-sync-on-open still works */
      }
    })();
  }, [googleConnected]);

  const createAction = useAsyncAction(
    async (payload: CalendarEventInput) => calendarService.create(payload),
    {
      onSuccess: (result) => {
        setEvents((prev) => sortEvents([...prev, result.event]));
        setAddOpen(null);
        setFeedback({
          tone: "success",
          message: result.googleSynced
            ? "Wydarzenie zostało dodane i zsynchronizowane z Google Calendar."
            : "Wydarzenie zostało dodane.",
        });
      },
      resolveError: (err) =>
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się dodać wydarzenia",
    },
  );

  const updateAction = useAsyncAction(
    async (args: { id: string; payload: CalendarEventInput }) => {
      const result = await calendarService.update(args.id, args.payload);
      return { ...result, id: args.id };
    },
    {
      onSuccess: (result) => {
        setEvents((prev) =>
          sortEvents(prev.map((e) => (e.id === result.id ? result.event : e))),
        );
        setEditingEvent(null);
        setFeedback({
          tone: "success",
          message: "Wydarzenie zostało zaktualizowane.",
        });
      },
      resolveError: (err) => {
        if (err instanceof ApiRequestError && err.status === 404) {
          void fetchEvents();
          return "Wydarzenie już nie istnieje. Lista została odświeżona.";
        }
        return err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zaktualizować wydarzenia";
      },
    },
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await calendarService.delete(id);
        setEvents((prev) => prev.filter((e) => e.id !== id));
        setFeedback({ tone: "success", message: "Wydarzenie zostało usunięte." });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          void fetchEvents();
          setFeedback({
            tone: "error",
            message: "Wydarzenie już nie istnieje. Lista została odświeżona.",
          });
        } else {
          setFeedback({
            tone: "error",
            message:
              err instanceof ApiRequestError
                ? err.message
                : "Nie udało się usunąć wydarzenia",
          });
        }
      } finally {
        setDeletingId(null);
      }
    },
    [fetchEvents],
  );

  const openAddForDay = useCallback(
    (day: Date) => {
      setForm(initialFormForDay(day));
      setFeedback(null);
      createAction.reset();
      setAddOpen(day);
    },
    [createAction],
  );

  const openEdit = useCallback(
    (event: CalendarEvent) => {
      setForm(initialFormForEvent(event));
      setFeedback(null);
      updateAction.reset();
      setEditingEvent(event);
    },
    [updateAction],
  );

  const closeAdd = useCallback(() => setAddOpen(null), []);
  const closeEdit = useCallback(() => setEditingEvent(null), []);

  const submitAdd = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!form.title.trim() || !form.start || !form.end) return;
      void createAction.run(buildPayload(form));
    },
    [createAction, form],
  );

  const submitEdit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!editingEvent || !form.title.trim() || !form.start || !form.end) return;
      void updateAction.run({ id: editingEvent.id, payload: buildPayload(form) });
    },
    [editingEvent, form, updateAction],
  );

  const gridDays = useMemo(() => buildMonthGrid(viewDate), [viewDate]);
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  const monthLabel = `${MONTHS_PL[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  const today = new Date();

  const goPrev = () =>
    setViewDate(
      (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1),
    );
  const goNext = () =>
    setViewDate(
      (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
    );
  const goToday = () => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    setViewDate(d);
  };

  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return eventsByDay.get(dayKey(selectedDay)) ?? [];
  }, [eventsByDay, selectedDay]);

  return (
    <div className="space-y-6">
      <Card padding="md">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-500" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-main)]">
                Kalendarz
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                {googleConnected
                  ? "Twoje wydarzenia oraz Google Calendar (synchronizacja w czasie rzeczywistym)"
                  : "Twoje wydarzenia"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
            onClick={() => openAddForDay(new Date())}
          >
            Dodaj wydarzenie
          </Button>
        </div>

        {loadError && (
          <div className="mb-4">
            <Alert tone="error" title="Błąd ładowania">
              {loadError}
            </Alert>
          </div>
        )}
        {feedback && (
          <div className="mb-4">
            <Alert tone={feedback.tone}>{feedback.message}</Alert>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Poprzedni miesiąc"
              onClick={goPrev}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="sm" onClick={goToday}>
              Dziś
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Następny miesiąc"
              onClick={goNext}
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
          <h3 className="text-base font-semibold text-[var(--text-main)] capitalize">
            {monthLabel}
          </h3>
          <div className="text-xs text-[var(--text-muted)]">
            {events.length}{" "}
            {events.length === 1 ? "wydarzenie" : "wydarzeń"} łącznie
          </div>
        </div>
      </Card>

      {initialLoading ? (
        <Skeleton className="h-[480px] rounded-2xl" />
      ) : (
        <MonthGrid
          gridDays={gridDays}
          viewDate={viewDate}
          today={today}
          eventsByDay={eventsByDay}
          onDayClick={(d) => setSelectedDay(d)}
        />
      )}

      <DayDrawer
        day={selectedDay}
        events={selectedDayEvents}
        onClose={() => setSelectedDay(null)}
        onAdd={(day) => {
          setSelectedDay(null);
          openAddForDay(day);
        }}
        onEdit={(event) => {
          setSelectedDay(null);
          openEdit(event);
        }}
        onDelete={handleDelete}
        deletingId={deletingId}
      />

      <EventFormDialog
        open={addOpen !== null}
        title="Nowe wydarzenie"
        submitLabel="Dodaj"
        submitIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
        form={form}
        onChange={setForm}
        onClose={closeAdd}
        onSubmit={submitAdd}
        submitting={createAction.pending}
        error={createAction.error}
      />

      <EventFormDialog
        open={editingEvent !== null}
        title="Edytuj wydarzenie"
        submitLabel="Zapisz"
        submitIcon={<Pencil className="w-4 h-4" aria-hidden="true" />}
        form={form}
        onChange={setForm}
        onClose={closeEdit}
        onSubmit={submitEdit}
        submitting={updateAction.pending}
        error={updateAction.error}
      />
    </div>
  );
}

function MonthGrid({
  gridDays,
  viewDate,
  today,
  eventsByDay,
  onDayClick,
}: {
  gridDays: Date[];
  viewDate: Date;
  today: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onDayClick: (day: Date) => void;
}) {
  return (
    <Card padding="sm">
      <div
        role="grid"
        aria-label="Kalendarz miesięczny"
        className="select-none"
      >
        <div className="grid grid-cols-7 gap-px mb-1 text-center">
          {WEEKDAYS_PL.map((d) => (
            <div
              key={d}
              className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] py-1"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-[var(--border-subtle)] rounded-xl overflow-hidden">
          {gridDays.map((day) => {
            const inMonth = day.getMonth() === viewDate.getMonth();
            const isToday = sameYMD(day, today);
            const dayEvents = eventsByDay.get(dayKey(day)) ?? [];
            const preview = dayEvents.slice(0, 3);
            const overflow = dayEvents.length - preview.length;
            return (
              <button
                key={day.toISOString()}
                role="gridcell"
                type="button"
                onClick={() => onDayClick(day)}
                aria-label={`${day.toLocaleDateString("pl-PL")}, ${dayEvents.length} wydarzeń`}
                className={`group relative min-h-[92px] text-left p-1.5 bg-[var(--bg-card)] hover:bg-[var(--bg-main)] transition-colors ${
                  inMonth ? "" : "opacity-40"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--text-main)]"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {preview.map((ev) => (
                    <EventPill key={ev.id} event={ev} />
                  ))}
                  {overflow > 0 && (
                    <span className="block text-[10px] text-[var(--text-muted)] px-1.5">
                      +{overflow} więcej
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function EventPill({ event }: { event: CalendarEvent }) {
  const isGoogle = event.source === "google";
  const color = event.color || (isGoogle ? "#4285F4" : "var(--accent)");
  return (
    <div
      className="flex items-center gap-1 text-[10px] leading-tight rounded-md px-1.5 py-0.5 truncate"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
      title={event.title}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="truncate">{event.title}</span>
    </div>
  );
}

function DayDrawer({
  day,
  events,
  onClose,
  onAdd,
  onEdit,
  onDelete,
  deletingId,
}: {
  day: Date | null;
  events: CalendarEvent[];
  onClose: () => void;
  onAdd: (day: Date) => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  const id = useId();
  if (!day) return null;
  const title = day.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Dialog
      open={day !== null}
      onClose={onClose}
      title={title}
      size="md"
      labelledById={id}
    >
      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="text-center py-6 text-sm text-[var(--text-muted)]">
            <CalendarDays
              className="w-8 h-8 mx-auto mb-2 opacity-40"
              aria-hidden="true"
            />
            Brak wydarzeń tego dnia.
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <DayEventRow
                key={ev.id}
                event={ev}
                onEdit={onEdit}
                onDelete={onDelete}
                deleting={deletingId === ev.id}
              />
            ))}
          </div>
        )}

        <Button
          className="w-full"
          leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
          onClick={() => onAdd(day)}
        >
          Dodaj wydarzenie w tym dniu
        </Button>
      </div>
    </Dialog>
  );
}

function DayEventRow({
  event,
  onEdit,
  onDelete,
  deleting,
}: {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const start = parseEventDate(event, "start");
  const end = parseEventDate(event, "end");
  const isGoogle = event.source === "google";

  const timeLabel = event.allDay
    ? "Cały dzień"
    : `${start.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="border border-[var(--border-subtle)] rounded-xl p-3 flex items-start gap-3 bg-[var(--bg-card)]">
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{
          backgroundColor:
            event.color || (isGoogle ? "#4285F4" : "var(--accent)"),
        }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-medium text-[var(--text-main)] truncate">
            {event.title}
          </span>
          {isGoogle && (
            <Badge tone="info">
              <Globe className="w-2.5 h-2.5 mr-1" aria-hidden="true" />
              Google
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {timeLabel}
          </span>
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              <span className="truncate max-w-[220px]">{event.location}</span>
            </span>
          )}
        </div>
        {event.description && (
          <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
            {event.description}
          </p>
        )}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Edytuj wydarzenie"
          onClick={() => onEdit(event)}
        >
          <Pencil className="w-4 h-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Usuń wydarzenie"
          loading={deleting}
          onClick={() => onDelete(event.id)}
          className="text-red-500 hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function EventFormDialog({
  open,
  title,
  submitLabel,
  submitIcon,
  form,
  onChange,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  submitIcon: React.ReactNode;
  form: EventFormState;
  onChange: (next: EventFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  submitting: boolean;
  error: string | null;
}) {
  const dialogId = useId();
  const patch = (partial: Partial<EventFormState>) =>
    onChange({ ...form, ...partial });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      labelledById={dialogId}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Tytuł"
          required
          value={form.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Nazwa wydarzenia"
          disabled={submitting}
        />

        <Checkbox
          label="Cały dzień"
          checked={form.allDay}
          onChange={(e) => patch({ allDay: e.target.checked })}
          disabled={submitting}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Początek"
            required
            type={form.allDay ? "date" : "datetime-local"}
            value={form.start}
            onChange={(e) => patch({ start: e.target.value })}
            disabled={submitting}
          />
          <Input
            label="Koniec"
            required
            type={form.allDay ? "date" : "datetime-local"}
            value={form.end}
            onChange={(e) => patch({ end: e.target.value })}
            disabled={submitting}
          />
        </div>

        <LocationAutocomplete
          label="Lokalizacja"
          value={form.location}
          onChange={(v) => patch({ location: v })}
          disabled={submitting}
          placeholder="Zacznij pisać aby wyszukać..."
        />

        <Textarea
          label="Opis"
          rows={3}
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Opcjonalnie"
          disabled={submitting}
        />

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            className="flex-1"
          >
            Anuluj
          </Button>
          <Button
            type="submit"
            loading={submitting}
            leftIcon={!submitting && submitIcon}
            className="flex-1"
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
