"use client";

import { useId, type FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  Input,
  Textarea,
} from "@/components/ui";
import { LocationAutocomplete } from "@/app/account/components/LocationAutocomplete";
import {
  normalizeBoundaryForAllDay,
  type EventFormState,
} from "@/lib/services/calendar-service";

/**
 * Add/edit dialog for calendar events. Stays a controlled component — the
 * parent owns state and decides whether the target picker is editable.
 */
export function CalendarForm({
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
  googleAvailable,
  moodleAvailable,
  targetEditable,
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
  googleAvailable: boolean;
  moodleAvailable: boolean;
  targetEditable: boolean;
}) {
  const dialogId = useId();
  const patch = (partial: Partial<EventFormState>) =>
    onChange({ ...form, ...partial });
  // Kept for potential future use when target picker is editable; cumulative
  // option count drives layout decisions in earlier revisions.
  void googleAvailable;
  void moodleAvailable;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      labelledById={dialogId}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {targetEditable && (
          <div className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-muted)]">
            Wydarzenie zostanie zapisane jako{" "}
            <strong className="text-[var(--text-main)]">MyPerformance</strong>{" "}
            i zsynchronizowane ze wszystkimi podłączonymi kalendarzami (Google,
            Akademia).
          </div>
        )}

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
          onChange={(e) => {
            const next = e.target.checked;
            patch({
              allDay: next,
              start: normalizeBoundaryForAllDay(form.start, next),
              end:
                normalizeBoundaryForAllDay(form.end, next) ||
                normalizeBoundaryForAllDay(form.start, next),
            });
          }}
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
