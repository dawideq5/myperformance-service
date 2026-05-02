"use client";

/**
 * Notatki wewnętrzne (Wave 19/Phase 1D).
 *
 * Lista pinned na górze + reszta chronologicznie (sort z backendu).
 * Markdown podstawowy: bold (**...**), italic (*...* / _..._), linki ([t](u)).
 * Real-time: subskrybujemy SSE bus (subscribeToService) — nowa notatka
 * pojawia się natychmiast (animacja fade-in via opacity transition).
 *
 * A11y: aria-live="polite" na liście — czytniki ekranu informują o nowych.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Pin,
  PinOff,
  Send,
  StickyNote,
  Trash2,
  EyeOff,
  Users,
} from "lucide-react";
import { subscribeToService } from "@/lib/sse-client";

interface InternalNote {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  body: string;
  authorEmail: string | null;
  authorName: string | null;
  authorRole: "service" | "sales" | "driver" | "other";
  visibility: "team" | "service_only";
  pinned: boolean;
  createdAt: string;
  deletedAt: string | null;
}

interface Props {
  serviceId: string;
  /** Email zalogowanego usera (do filtrowania delete/pin uprawnień). */
  currentUserEmail: string;
}

function initials(name: string | null, email: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "przed chwilą";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min temu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} godz. temu`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d. temu`;
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Bardzo prosty markdown → HTML: bold, italic, linki. Escape całej reszty. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  // Linki [text](https://...)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline">$1</a>',
  );
  // Bold **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic *text* lub _text_
  out = out.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/_([^_\s][^_]*?)_/g, "<em>$1</em>");
  return out;
}

function renderMarkdown(body: string): string {
  return body
    .split(/\n/)
    .map((line) => renderInline(line))
    .join("<br />");
}

const ROLE_LABEL: Record<InternalNote["authorRole"], string> = {
  service: "Serwis",
  sales: "Sprzedaż",
  driver: "Kierowca",
  other: "Inne",
};

export function InternalNotesPanel({ serviceId, currentUserEmail }: Props) {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [visibility, setVisibility] =
    useState<InternalNote["visibility"]>("team");
  const recentlyAddedIds = useRef<Set<string>>(new Set());

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(
        `/api/relay/services/${serviceId}/internal-notes`,
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as { notes?: InternalNote[] };
      setNotes(j.notes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  // Real-time SSE — refetch po internal_note_* events.
  useEffect(() => {
    const unsub = subscribeToService(serviceId, (evt) => {
      if (
        evt.type === "internal_note_added" ||
        evt.type === "internal_note_deleted" ||
        evt.type === "internal_note_pinned" ||
        evt.type === "internal_note_unpinned"
      ) {
        const noteId =
          typeof evt.payload?.noteId === "string"
            ? (evt.payload.noteId as string)
            : null;
        if (noteId && evt.type === "internal_note_added") {
          recentlyAddedIds.current.add(noteId);
          // GC po 5s
          setTimeout(() => recentlyAddedIds.current.delete(noteId), 5_000);
        }
        void fetchNotes();
      }
    });
    return unsub;
  }, [serviceId, fetchNotes]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`/api/relay/services/${serviceId}/internal-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, visibility }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      setDraft("");
      await fetchNotes();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const togglePin = async (note: InternalNote) => {
    try {
      const r = await fetch(
        `/api/relay/services/${serviceId}/internal-notes/${note.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !note.pinned }),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await fetchNotes();
    } catch {
      /* silent — SSE refetch and zwykły refresh i tak złapie */
    }
  };

  const remove = async (note: InternalNote) => {
    if (!confirm("Usunąć notatkę?")) return;
    try {
      const r = await fetch(
        `/api/relay/services/${serviceId}/internal-notes/${note.id}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await fetchNotes();
    } catch {
      /* silent */
    }
  };

  const sorted = useMemo(() => notes, [notes]);

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div
        className="p-3 rounded-xl border space-y-2"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <label
          htmlFor="note-draft"
          className="text-[11px] uppercase tracking-wider font-semibold flex items-center gap-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          <StickyNote className="w-3.5 h-3.5" />
          Nowa notatka wewnętrzna
        </label>
        <textarea
          id="note-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Wpisz notatkę…"
          rows={3}
          className="w-full px-3 py-2 rounded-lg text-sm resize-y"
          style={{
            background: "var(--bg-surface)",
            color: "var(--text-main)",
            border: "1px solid var(--border-subtle)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={() =>
                setVisibility(visibility === "team" ? "service_only" : "team")
              }
              className="flex items-center gap-1.5 px-2 py-1 rounded-md border"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
              title={
                visibility === "team"
                  ? "Widoczne dla całego zespołu"
                  : "Widoczne tylko dla serwisu"
              }
            >
              {visibility === "team" ? (
                <Users className="w-3 h-3" />
              ) : (
                <EyeOff className="w-3 h-3" />
              )}
              {visibility === "team" ? "Cały zespół" : "Tylko serwis"}
            </button>
            <span style={{ color: "var(--text-muted)" }}>
              {draft.length} / 5000
            </span>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!draft.trim() || submitting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Dodaj notatkę
          </button>
        </div>
        {submitError && (
          <p className="text-xs" style={{ color: "#ef4444" }} role="alert">
            {submitError}
          </p>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      ) : error ? (
        <div className="p-3 rounded-xl border text-center text-sm" role="alert"
          style={{ borderColor: "#ef4444", color: "#ef4444" }}>
          {error}
        </div>
      ) : sorted.length === 0 ? (
        <div
          className="p-3 rounded-xl border text-center text-sm"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Brak notatek wewnętrznych.
        </div>
      ) : (
        <ul
          className="space-y-2"
          aria-live="polite"
          aria-label="Notatki wewnętrzne — aktualizowane na żywo"
        >
          {sorted.map((note) => {
            const isOwn =
              note.authorEmail?.toLowerCase() ===
              currentUserEmail.toLowerCase();
            const isNew = recentlyAddedIds.current.has(note.id);
            return (
              <li
                key={note.id}
                className={`p-3 rounded-xl border transition-opacity duration-500 ${
                  isNew ? "opacity-100 animate-pulse" : "opacity-100"
                }`}
                style={{
                  borderColor: note.pinned
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  background: "var(--bg-card)",
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar / inicjały */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold"
                    style={{
                      background: "var(--bg-surface)",
                      color: "var(--text-main)",
                    }}
                    aria-hidden="true"
                  >
                    {initials(note.authorName, note.authorEmail)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--text-main)" }}
                      >
                        {note.authorName ?? note.authorEmail ?? "—"}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          background: "var(--bg-surface)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {ROLE_LABEL[note.authorRole]}
                      </span>
                      {note.visibility === "service_only" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                          style={{
                            background: "var(--bg-surface)",
                            color: "var(--text-muted)",
                          }}
                          title="Widoczna tylko dla serwisu"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                          tylko serwis
                        </span>
                      )}
                      {note.pinned && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                          style={{
                            background: "var(--accent)",
                            color: "#fff",
                          }}
                        >
                          <Pin className="w-2.5 h-2.5" />
                          przypięte
                        </span>
                      )}
                      <span
                        className="text-[10px] ml-auto"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {formatRelative(note.createdAt)}
                      </span>
                    </div>
                    <div
                      className="text-sm mt-1 break-words"
                      style={{ color: "var(--text-main)" }}
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(note.body),
                      }}
                    />
                  </div>
                  {isOwn && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => void togglePin(note)}
                        className="p-1.5 rounded-md"
                        style={{ color: "var(--text-muted)" }}
                        title={note.pinned ? "Odepnij" : "Przypnij"}
                        aria-label={
                          note.pinned ? "Odepnij notatkę" : "Przypnij notatkę"
                        }
                      >
                        {note.pinned ? (
                          <PinOff className="w-3.5 h-3.5" />
                        ) : (
                          <Pin className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(note)}
                        className="p-1.5 rounded-md"
                        style={{ color: "#ef4444" }}
                        title="Usuń"
                        aria-label="Usuń notatkę"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
