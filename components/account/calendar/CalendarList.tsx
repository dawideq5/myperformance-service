"use client";

import { useId } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, Card, Dialog } from "@/components/ui";
import {
  WEEKDAYS_PL,
  dayKey,
  eventStripeColor,
  isKadromierz,
  parseEventDate,
  sameYMD,
} from "@/lib/services/calendar-service";
import type { CalendarEvent } from "@/app/account/types";
import { CalendarFanoutBadge } from "./CalendarFanoutBadge";

/**
 * Calendar list & grid views. Exposes:
 *   - MonthGrid: 6×7 day cells with up to 3 event pills + overflow chip.
 *   - DayDrawer: dialog for the selected day with event rows + add CTA.
 *
 * Both views are pure presentational — parent owns `events` aggregation, the
 * child only paints + emits clicks.
 */

export function MonthGrid({
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
  const color = eventStripeColor(event);
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

export function DayDrawer({
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
  const isKadro = isKadromierz(event);
  // Respect the backend's readOnly flag verbatim — Moodle user-events come
  // through as editable (readOnly=false), site/course/group events don't.
  const readOnly = event.readOnly === true || isKadro;

  const timeLabel = event.allDay
    ? "Cały dzień"
    : `${start.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;

  const stripeColor = eventStripeColor(event);

  return (
    <div className="border border-[var(--border-subtle)] rounded-xl p-3 flex items-start gap-3 bg-[var(--bg-card)]">
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ backgroundColor: stripeColor }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-medium text-[var(--text-main)] truncate">
            {event.title}
          </span>
          <CalendarFanoutBadge event={event} />
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
      {!readOnly && (
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
      )}
    </div>
  );
}
