"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  AlignLeft,
  Calendar,
  CalendarDays,
  Clock,
  Globe,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
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

type Filter = "all" | "manual" | "google";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Wszystkie",
  manual: "Moje",
  google: "Google",
};

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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalDatetimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );
}

function initialFormForEvent(event: CalendarEvent): EventFormState {
  return {
    title: event.title,
    description: event.description ?? "",
    start: event.allDay
      ? event.startDate.split("T")[0]
      : toLocalDatetimeValue(new Date(event.startDate)),
    end: event.allDay
      ? event.endDate.split("T")[0]
      : toLocalDatetimeValue(new Date(event.endDate)),
    allDay: event.allDay,
    location: event.location ?? "",
  };
}

function initialFormForNew(): EventFormState {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    ...EMPTY_FORM,
    start: toLocalDatetimeValue(now),
    end: toLocalDatetimeValue(later),
  };
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
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);

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

  const syncAction = useAsyncAction(async () => calendarService.syncGoogle(), {
    onSuccess: (result) => {
      setEvents(sortEvents(result.events ?? []));
      setFeedback({
        tone: "success",
        message: `Zsynchronizowano ${result.synced} wydarzeń z Google Calendar.`,
      });
    },
    resolveError: (err) => {
      if (err instanceof ApiRequestError) {
        if (err.status === 401) {
          return "Token Google wygasł. Połącz ponownie konto Google.";
        }
        return err.message;
      }
      return "Wystąpił błąd podczas synchronizacji";
    },
  });

  const createAction = useAsyncAction(
    async (payload: CalendarEventInput) => calendarService.create(payload),
    {
      onSuccess: (result) => {
        setEvents((prev) => sortEvents([...prev, result.event]));
        setAddOpen(false);
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
      resolveError: (err) =>
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zaktualizować wydarzenia",
    },
  );

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await calendarService.delete(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setFeedback({ tone: "success", message: "Wydarzenie zostało usunięte." });
    } catch (err) {
      setFeedback({
        tone: "error",
        message:
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się usunąć wydarzenia",
      });
    } finally {
      setDeletingId(null);
    }
  }, []);

  const openAdd = useCallback(() => {
    setForm(initialFormForNew());
    setFeedback(null);
    createAction.reset();
    setAddOpen(true);
  }, [createAction]);

  const openEdit = useCallback(
    (event: CalendarEvent) => {
      setForm(initialFormForEvent(event));
      setFeedback(null);
      updateAction.reset();
      setEditingEvent(event);
    },
    [updateAction],
  );

  const closeAdd = useCallback(() => setAddOpen(false), []);
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

  const { upcoming, past, countsByFilter } = useMemo(() => {
    const now = Date.now();
    const filtered = events.filter(
      (e) => filter === "all" || e.source === filter,
    );
    return {
      upcoming: filtered.filter((e) => new Date(e.endDate).getTime() >= now),
      past: filtered.filter((e) => new Date(e.endDate).getTime() < now),
      countsByFilter: {
        all: events.length,
        manual: events.filter((e) => e.source === "manual").length,
        google: events.filter((e) => e.source === "google").length,
      } as Record<Filter, number>,
    };
  }, [events, filter]);

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
                Twoje wydarzenia i synchronizacja z Google
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {googleConnected && (
              <Button
                variant="secondary"
                size="sm"
                loading={syncAction.pending}
                leftIcon={
                  !syncAction.pending && (
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  )
                }
                onClick={() => void syncAction.run()}
              >
                <span className="hidden sm:inline">Pobierz z Google</span>
                <span className="sm:hidden">Google</span>
              </Button>
            )}
            <Button
              size="sm"
              leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
              onClick={openAdd}
            >
              Dodaj wydarzenie
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="mb-4">
            <Alert tone="error" title="Błąd ładowania">
              {loadError}
            </Alert>
          </div>
        )}
        {syncAction.error && (
          <div className="mb-4">
            <Alert tone="error">{syncAction.error}</Alert>
          </div>
        )}
        {feedback && (
          <div className="mb-4">
            <Alert tone={feedback.tone}>{feedback.message}</Alert>
          </div>
        )}

        <div
          role="tablist"
          aria-label="Filtr wydarzeń"
          className="flex gap-1 p-1 bg-[var(--bg-main)] rounded-xl w-fit"
        >
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                {FILTER_LABELS[f]}
                <span className="ml-1.5 opacity-60">{countsByFilter[f]}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {initialLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <Card padding="md">
          <div className="p-8 text-center">
            <CalendarDays
              className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--text-muted)]">
              Brak wydarzeń. Dodaj pierwsze lub pobierz z Google.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <EventSection
              title="Nadchodzące"
              events={upcoming}
              onDelete={handleDelete}
              onEdit={openEdit}
              deletingId={deletingId}
            />
          )}
          {past.length > 0 && (
            <EventSection
              title="Przeszłe"
              events={past}
              onDelete={handleDelete}
              onEdit={openEdit}
              deletingId={deletingId}
              muted
            />
          )}
        </div>
      )}

      <EventFormDialog
        open={addOpen}
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

function EventSection({
  title,
  events,
  onDelete,
  onEdit,
  deletingId,
  muted,
}: {
  title: string;
  events: CalendarEvent[];
  onDelete: (id: string) => void;
  onEdit: (event: CalendarEvent) => void;
  deletingId: string | null;
  muted?: boolean;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-1">
        {title}
      </h3>
      <div className={`space-y-2 ${muted ? "opacity-60" : ""}`}>
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onDelete={onDelete}
            onEdit={onEdit}
            deleting={deletingId === event.id}
          />
        ))}
      </div>
    </section>
  );
}

function EventCard({
  event,
  onDelete,
  onEdit,
  deleting,
}: {
  event: CalendarEvent;
  onDelete: (id: string) => void;
  onEdit: (event: CalendarEvent) => void;
  deleting: boolean;
}) {
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const isGoogle = event.source === "google";

  const formatDate = (d: Date) =>
    event.allDay
      ? d.toLocaleDateString("pl-PL", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : d.toLocaleString("pl-PL", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });

  const sameDay = end.toDateString() === start.toDateString();
  const endLabel = sameDay
    ? event.allDay
      ? ""
      : end.toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit",
        })
    : formatDate(end);

  return (
    <div className="group bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-4 flex items-start gap-4 hover:border-[var(--accent)]/30 transition-colors">
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{
          backgroundColor:
            event.color || (isGoogle ? "#4285F4" : "var(--accent)"),
        }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
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
            {formatDate(start)}
            {endLabel && ` – ${endLabel}`}
          </span>
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              {event.location}
            </span>
          )}
          {event.description && (
            <span className="inline-flex items-center gap-1">
              <AlignLeft className="w-3 h-3" aria-hidden="true" />
              <span className="truncate max-w-[200px]">{event.description}</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Edytuj wydarzenie"
          onClick={() => onEdit(event)}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <Pencil className="w-4 h-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Usuń wydarzenie"
          loading={deleting}
          onClick={() => onDelete(event.id)}
          className="text-red-500 hover:bg-red-500/10 hover:text-red-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
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

        <Input
          label="Lokalizacja"
          value={form.location}
          onChange={(e) => patch({ location: e.target.value })}
          placeholder="Opcjonalnie"
          disabled={submitting}
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
