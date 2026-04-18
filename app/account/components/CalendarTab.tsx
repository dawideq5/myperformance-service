"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calendar, Plus, RefreshCw, Trash2, Globe, X, AlertCircle,
  CheckCircle2, Loader2, MapPin, Clock, AlignLeft, CalendarDays, Pencil,
} from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  source: "manual" | "google";
  googleEventId?: string;
  color?: string;
  location?: string;
}

type Filter = "all" | "manual" | "google";

export function CalendarTab() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formAllDay, setFormAllDay] = useState(false);
  const [formLocation, setFormLocation] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const syncGoogle = async () => {
    try {
      setSyncing(true);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/calendar/google-sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setEvents(data.events || []);
        setSuccess(`Zsynchronizowano ${data.synced} wydarzeń z Google Calendar.`);
      } else if (data.needsReconnect) {
        setError(data.error || "Token Google wygasł. Połącz ponownie konto Google.");
      } else {
        setError(data.error || "Błąd synchronizacji z Google Calendar");
      }
    } catch {
      setError("Wystąpił błąd podczas synchronizacji");
    } finally {
      setSyncing(false);
    }
  };

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/calendar/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      setError("Nie udało się pobrać wydarzeń");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const deleteEvent = async (id: string) => {
    try {
      setDeletingId(id);
      const res = await fetch(`/api/calendar/events/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== id));
      } else {
        setError("Nie udało się usunąć wydarzenia");
      }
    } catch {
      setError("Wystąpił błąd podczas usuwania");
    } finally {
      setDeletingId(null);
    }
  };

  const openAddModal = () => {
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    setFormTitle("");
    setFormDesc("");
    setFormStart(toLocalDatetimeValue(now));
    setFormEnd(toLocalDatetimeValue(later));
    setFormAllDay(false);
    setFormLocation("");
    setAddModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormDesc(event.description || "");
    setFormStart(event.allDay ? event.startDate.split('T')[0] : toLocalDatetimeValue(new Date(event.startDate)));
    setFormEnd(event.allDay ? event.endDate.split('T')[0] : toLocalDatetimeValue(new Date(event.endDate)));
    setFormAllDay(event.allDay);
    setFormLocation(event.location || "");
    setEditModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  const saveEditEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formStart || !formEnd || !editingEvent) return;
    try {
      setFormSaving(true);
      const res = await fetch(`/api/calendar/events/${editingEvent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDesc.trim() || undefined,
          startDate: formAllDay ? formStart.split("T")[0] : new Date(formStart).toISOString(),
          endDate: formAllDay ? formEnd.split("T")[0] : new Date(formEnd).toISOString(),
          allDay: formAllDay,
          location: formLocation.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditModalOpen(false);
        setSuccess("Wydarzenie zostało zaktualizowane.");
        setEvents((prev) => prev.map((e) => e.id === editingEvent.id ? data.event : e).sort(
          (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        ));
      } else {
        setError(data.error || "Nie udało się zaktualizować wydarzenia");
      }
    } catch {
      setError("Wystąpił błąd podczas aktualizacji");
    } finally {
      setFormSaving(false);
    }
  };

  const saveNewEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formStart || !formEnd) return;
    try {
      setFormSaving(true);
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDesc.trim() || undefined,
          startDate: formAllDay ? formStart.split("T")[0] : new Date(formStart).toISOString(),
          endDate: formAllDay ? formEnd.split("T")[0] : new Date(formEnd).toISOString(),
          allDay: formAllDay,
          location: formLocation.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddModalOpen(false);
        setSuccess(data.googleSynced ? "Wydarzenie zostało dodane i zsynchronizowane z Google Calendar." : "Wydarzenie zostało dodane.");
        setEvents((prev) => [...prev, data.event].sort(
          (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        ));
      } else {
        setError(data.error || "Nie udało się dodać wydarzenia");
      }
    } catch {
      setError("Wystąpił błąd podczas dodawania");
    } finally {
      setFormSaving(false);
    }
  };

  const filtered = events.filter((e) => filter === "all" || e.source === filter);
  const upcoming = filtered.filter((e) => new Date(e.endDate) >= new Date());
  const past = filtered.filter((e) => new Date(e.endDate) < new Date());

  return (
    <div className="space-y-6 animate-tab-in">
      {/* Header card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-main)]">Kalendarz</h2>
              <p className="text-sm text-[var(--text-muted)]">Twoje wydarzenia i synchronizacja z Google</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={syncGoogle}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-3 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-xl text-sm font-medium hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-colors disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="hidden sm:inline">Pobierz z Google</span>
            </button>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Dodaj wydarzenie
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-sm text-red-500">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-2 text-sm text-green-500">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 bg-[var(--bg-main)] rounded-xl w-fit">
          {(["all", "manual", "google"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {f === "all" ? "Wszystkie" : f === "manual" ? "Moje" : "Google"}
              <span className="ml-1.5 text-xs opacity-60">
                {f === "all" ? events.length : events.filter((e) => e.source === f).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Events list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-12 text-center">
          <CalendarDays className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
          <p className="text-[var(--text-muted)] text-sm">Brak wydarzeń. Dodaj pierwsze lub pobierz z Google.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-1">Nadchodzące</h3>
              <div className="space-y-2">
                {upcoming.map((event) => (
                  <EventCard key={event.id} event={event} onDelete={deleteEvent} onEdit={openEditModal} deleting={deletingId === event.id} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-1">Przeszłe</h3>
              <div className="space-y-2 opacity-60">
                {past.map((event) => (
                  <EventCard key={event.id} event={event} onDelete={deleteEvent} onEdit={openEditModal} deleting={deletingId === event.id} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Add event modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddModalOpen(false)} />
          <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-[var(--text-main)]">Nowe wydarzenie</h3>
              <button onClick={() => setAddModalOpen(false)} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveNewEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Tytuł *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Nazwa wydarzenia"
                  className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allDay"
                  checked={formAllDay}
                  onChange={(e) => setFormAllDay(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--accent)]"
                />
                <label htmlFor="allDay" className="text-sm text-[var(--text-muted)] cursor-pointer">Cały dzień</label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Początek *</label>
                  <input
                    type={formAllDay ? "date" : "datetime-local"}
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Koniec *</label>
                  <input
                    type={formAllDay ? "date" : "datetime-local"}
                    required
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Lokalizacja</label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="Opcjonalnie"
                  className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Opis</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Opcjonalnie"
                  rows={3}
                  className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-xl text-sm font-medium hover:text-[var(--text-main)] transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="flex-1 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {formSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Dodaj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit event modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-[var(--text-main)]">Edytuj wydarzenie</h3>
              <button onClick={() => setEditModalOpen(false)} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveEditEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Tytuł *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Nazwa wydarzenia"
                  className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allDayEdit"
                  checked={formAllDay}
                  onChange={(e) => setFormAllDay(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--accent)]"
                />
                <label htmlFor="allDayEdit" className="text-sm text-[var(--text-muted)] cursor-pointer">Cały dzień</label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Początek *</label>
                  <input
                    type={formAllDay ? "date" : "datetime-local"}
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Koniec *</label>
                  <input
                    type={formAllDay ? "date" : "datetime-local"}
                    required
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Lokalizacja</label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="Opcjonalnie"
                  className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Opis</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Opcjonalnie"
                  rows={3}
                  className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-xl text-sm font-medium hover:text-[var(--text-main)] transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="flex-1 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {formSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                  Zapisz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
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
      ? d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })
      : d.toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="group bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-4 flex items-start gap-4 hover:border-[var(--accent)]/30 transition-colors">
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ backgroundColor: event.color || (isGoogle ? "#4285F4" : "var(--accent)") }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-[var(--text-main)] truncate">{event.title}</span>
          {isGoogle && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-full flex-shrink-0">
              <Globe className="w-2.5 h-2.5" />
              Google
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(start)} – {end.toDateString() !== start.toDateString() ? formatDate(end) : event.allDay ? "" : end.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {event.location}
            </span>
          )}
          {event.description && (
            <span className="inline-flex items-center gap-1">
              <AlignLeft className="w-3 h-3" />
              <span className="truncate max-w-[200px]">{event.description}</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onEdit(event)}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50 flex-shrink-0"
          title="Edytuj wydarzenie"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(event.id)}
          disabled={deleting}
          className="p-1.5 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50 flex-shrink-0"
          title="Usuń wydarzenie"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
