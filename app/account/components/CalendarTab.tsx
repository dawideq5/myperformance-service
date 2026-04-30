"use client";

import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";

import { Alert, Button, Card, Skeleton } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useCalendarSources } from "@/hooks/useCalendarSources";
import {
  EMPTY_FORM,
  MONTHS_PL,
  buildMonthGrid,
  buildPayload,
  dayKey,
  dedupeEvents,
  groupEventsByDay,
  initialFormForDay,
  initialFormForEvent,
  sortEvents,
  type EventFormState,
  type EventTarget,
} from "@/lib/services/calendar-service";

import { useAccount } from "../AccountProvider";
import {
  calendarService,
  type CalendarEventInput,
} from "../calendar-service";
import type { CalendarEvent } from "../types";
import { CalendarForm } from "@/components/account/calendar/CalendarForm";
import {
  DayDrawer,
  MonthGrid,
} from "@/components/account/calendar/CalendarList";

/**
 * Calendar tab shell — composes the month grid, day drawer, and create/edit
 * dialogs. Multi-source state + effects live in `useCalendarSources`; pure
 * helpers (date parsers, payload build, dedupe, grid math) live in
 * `lib/services/calendar-service.ts`. View pieces live in
 * `components/account/calendar/`.
 */
export function CalendarTab() {
  const { googleStatus, kadromierzStatus, moodleStatus } = useAccount();
  const googleConnected = googleStatus?.connected === true;
  const kadromierzConnected = kadromierzStatus?.connected === true;
  const moodleConnected = moodleStatus?.connected === true;
  const hasExternalSources =
    googleConnected || kadromierzConnected || moodleConnected;

  const [viewDate, setViewDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const sources = useCalendarSources({
    googleConnected,
    kadromierzConnected,
    moodleConnected,
    viewDate,
  });

  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [addOpen, setAddOpen] = useState<Date | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
  const [syncing, setSyncing] = useState(false);

  const createAction = useAsyncAction(
    async (args: { payload: CalendarEventInput; target: EventTarget }) => {
      const result = await calendarService.create({
        ...args.payload,
        target: args.target,
      });
      return { ...result, target: args.target };
    },
    {
      onSuccess: (result) => {
        if (result.target === "moodle") {
          sources.setMoodleEvents((prev) =>
            sortEvents([...prev, result.event]),
          );
          setFeedback({
            tone: "success",
            message: "Wydarzenie zostało dodane w Akademii (Moodle).",
          });
        } else {
          sources.setEvents((prev) => sortEvents([...prev, result.event]));
          setFeedback({
            tone: "success",
            message:
              result.target === "google"
                ? "Wydarzenie zostało dodane w Google Calendar i pojawiło się w kalendarzu."
                : "Wydarzenie zostało dodane.",
          });
        }
        setAddOpen(null);
      },
      resolveError: (err) =>
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się dodać wydarzenia",
    },
  );

  const updateAction = useAsyncAction(
    async (args: {
      id: string;
      payload: CalendarEventInput;
      source: CalendarEvent["source"];
    }) => {
      const result = await calendarService.update(args.id, args.payload);
      return { ...result, id: args.id, source: args.source };
    },
    {
      onSuccess: (result) => {
        if (result.source === "moodle") {
          sources.setMoodleEvents((prev) =>
            sortEvents(
              prev.filter((e) => e.id !== result.id).concat(result.event),
            ),
          );
        } else {
          sources.setEvents((prev) =>
            sortEvents(
              prev.map((e) => (e.id === result.id ? result.event : e)),
            ),
          );
          if (result.event.googleEventId || result.source === "google") {
            sources.setGoogleMonthEvents((prev) =>
              sortEvents(
                prev.map((e) =>
                  e.id === result.id ||
                  (result.event.googleEventId &&
                    e.googleEventId === result.event.googleEventId)
                    ? {
                        ...e,
                        ...result.event,
                        source: "google",
                      }
                    : e,
                ),
              ),
            );
          }
        }
        setEditingEvent(null);
        setFeedback({
          tone: "success",
          message: "Wydarzenie zostało zaktualizowane.",
        });
      },
      resolveError: (err) => {
        if (err instanceof ApiRequestError && err.status === 404) {
          void sources.fetchEvents();
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
        if (id.startsWith("moodle_")) {
          sources.setMoodleEvents((prev) => prev.filter((e) => e.id !== id));
        } else {
          sources.setEvents((prev) => prev.filter((e) => e.id !== id));
          sources.setGoogleMonthEvents((prev) =>
            prev.filter(
              (e) => e.id !== id && `google_${e.googleEventId}` !== id,
            ),
          );
        }
        setFeedback({
          tone: "success",
          message: "Wydarzenie zostało usunięte.",
        });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          void sources.fetchEvents();
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
    [sources],
  );

  const handleManualSync = useCallback(async () => {
    setSyncing(true);
    setFeedback(null);
    const result = await sources.syncAll();
    setSyncing(false);

    if (result.error) {
      setFeedback({ tone: "error", message: result.error });
      return;
    }

    if (result.googleNeedsReconnect) {
      setFeedback({
        tone: "error",
        message:
          "Token Google wygasł. Połącz ponownie konto Google w zakładce integracje.",
      });
      return;
    }

    setFeedback({
      tone: result.failedSources > 0 ? "error" : "success",
      message:
        result.failedSources > 0
          ? `Odświeżono bieżący widok miesiąca, ale ${result.failedSources} ${result.failedSources === 1 ? "źródło zwróciło błąd" : "źródła zwróciły błędy"}.`
          : `Odświeżono dane bieżącego widoku z ${result.refreshedSources} ${result.refreshedSources === 1 ? "źródła" : "źródeł"}.`,
    });
  }, [sources]);

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
      void createAction.run({
        payload: buildPayload(form),
        target: form.target,
      });
    },
    [createAction, form],
  );

  const submitEdit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!editingEvent || !form.title.trim() || !form.start || !form.end)
        return;
      void updateAction.run({
        id: editingEvent.id,
        payload: buildPayload(form),
        source: editingEvent.source,
      });
    },
    [editingEvent, form, updateAction],
  );

  const gridDays = useMemo(() => buildMonthGrid(viewDate), [viewDate]);
  // `events` holds local (manual) entries + persisted Google cache. We drop
  // the cached Google rows in favour of the live month fetch to keep the
  // grid fresh as the user navigates months.
  const combinedEvents = useMemo(
    () =>
      dedupeEvents([
        ...sources.events.filter((e) => e.source !== "google"),
        ...sources.googleMonthEvents,
        ...sources.kadromierzShifts,
        ...sources.moodleEvents,
      ]),
    [
      sources.events,
      sources.googleMonthEvents,
      sources.kadromierzShifts,
      sources.moodleEvents,
    ],
  );
  const eventsByDay = useMemo(
    () => groupEventsByDay(combinedEvents),
    [combinedEvents],
  );

  const monthLabel = `${MONTHS_PL[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  const today = new Date();

  const goPrev = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNext = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
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
              <Calendar
                className="w-6 h-6 text-blue-500"
                aria-hidden="true"
              />
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
          <div className="flex items-center gap-2 flex-wrap">
            {sources.monthSyncing && (
              <span className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1">
                <RefreshCw
                  className="w-3 h-3 animate-spin"
                  aria-hidden="true"
                />
                Synchronizacja miesiąca…
              </span>
            )}
            {hasExternalSources && (
              <Button
                size="sm"
                variant="secondary"
                loading={syncing}
                leftIcon={
                  !syncing && (
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  )
                }
                onClick={handleManualSync}
              >
                Synchronizuj
              </Button>
            )}
            <Button
              size="sm"
              leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
              onClick={() => openAddForDay(new Date())}
            >
              Dodaj wydarzenie
            </Button>
          </div>
        </div>

        {sources.loadError && (
          <div className="mb-4">
            <Alert tone="error" title="Błąd ładowania">
              {sources.loadError}
            </Alert>
          </div>
        )}
        {sources.googleNeedsReconnect && (
          <div className="mb-4">
            <Alert tone="warning" title="Połącz ponownie konto Google">
              Token Google wygasł. Wróć do zakładki integracje i odnów
              połączenie — wydarzenia z Google pojawią się ponownie.
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
            {combinedEvents.length}{" "}
            {combinedEvents.length === 1 ? "wydarzenie" : "wydarzeń"} w widoku
          </div>
        </div>
      </Card>

      {sources.initialLoading ? (
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

      <CalendarForm
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
        googleAvailable={googleConnected}
        moodleAvailable={moodleConnected}
        targetEditable
      />

      <CalendarForm
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
        googleAvailable={googleConnected}
        moodleAvailable={moodleConnected}
        targetEditable={false}
      />
    </div>
  );
}
