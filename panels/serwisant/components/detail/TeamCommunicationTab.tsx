"use client";

/**
 * Wave 21 / Faza 1D — zunifikowana zakładka "Zespół".
 *
 * Zastępuje dwa poprzednie taby (Czat zespołu + Notatki) jednym streamem
 * notatek z visibility per rola:
 *   - "Wszyscy"           → team
 *   - "Tylko serwisanci"  → service_only
 *   - "Tylko sprzedawcy"  → sales_only
 *
 * Backend single source of truth: `mp_service_internal_notes`.
 * Legacy `mp_service_internal_messages` zostaje read-only (CzatZespoluTab
 * i jego endpoint nadal istnieją dla historycznych rekordów, ale nie są
 * mountowane w ServiceDetailView). Filtrowanie visibility per `viewerRole`
 * dzieje się w `lib/service-internal-notes.ts:listInternalNotes`.
 *
 * Display:
 *   - Tylko imię i nazwisko (z `author_name`; fallback do localpart maila
 *     po replace `[._-]+ → ' '` + capitalize). NIE pokazujemy roli ani emaila.
 *   - Markdown podstawowy (bold/italic/links) — z InternalNotesPanel.
 *
 * Real-time: SSE `internal_note_*` events refetch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EyeOff,
  Loader2,
  Pin,
  PinOff,
  Send,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { subscribeToService } from "@/lib/sse-client";

type Visibility = "team" | "service_only" | "sales_only";
type AuthorRole = "service" | "sales" | "driver" | "other";
export type ViewerRole = "service" | "sales" | "admin";

interface InternalNote {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  body: string;
  authorEmail: string | null;
  authorName: string | null;
  authorRole: AuthorRole;
  visibility: Visibility;
  pinned: boolean;
  createdAt: string;
  deletedAt: string | null;
}

interface Props {
  serviceId: string;
  /** Email zalogowanego usera (do filtrowania delete/pin uprawnień). */
  currentUserEmail: string;
  /**
   * Rola widza (Wave 21). `service` widzi `team` + `service_only`,
   * `sales` widzi `team` + `sales_only`, `admin` widzi wszystko.
   * Backend i tak filtruje po realm roles z KC tokenu — to tylko hint do
   * UI (pre-select w composerze, query param `?role=` przy fetchu).
   */
  viewerRole?: ViewerRole;
}

interface VisibilityOption {
  value: Visibility;
  label: string;
  icon: typeof Users;
  description: string;
}

const ALL_VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: "team",
    label: "Wszyscy (sprzedawcy + serwisanci)",
    icon: Users,
    description: "Cały zespół (sprzedaż i serwis)",
  },
  {
    value: "service_only",
    label: "Tylko serwisanci",
    icon: Wrench,
    description: "Widoczna tylko dla działu serwisu",
  },
  {
    value: "sales_only",
    label: "Tylko sprzedawcy",
    icon: EyeOff,
    description: "Widoczna tylko dla działu sprzedaży",
  },
];

/**
 * Wave 22 / F9 — pokazujemy tylko widoczność adekwatną do roli widza:
 *   - service → "Wszyscy" + "Tylko serwisanci" (NIGDY "Tylko sprzedawcy")
 *   - sales   → "Wszyscy" + "Tylko sprzedawcy"
 *   - admin   → wszystkie 3 (back-office może przeglądać/notować na rzecz
 *                obu działów)
 *
 * Backend (`internal-notes/route.ts`) ma analogiczny check w POST — to UI
 * filter to ergonomia, nie security.
 */
function visibilityOptionsForRole(role: ViewerRole): VisibilityOption[] {
  if (role === "admin") return ALL_VISIBILITY_OPTIONS;
  if (role === "sales") {
    return ALL_VISIBILITY_OPTIONS.filter(
      (o) => o.value === "team" || o.value === "sales_only",
    );
  }
  return ALL_VISIBILITY_OPTIONS.filter(
    (o) => o.value === "team" || o.value === "service_only",
  );
}

const VISIBILITY_LABEL: Record<Visibility, string> = {
  team: "Wszyscy",
  service_only: "Tylko serwisanci",
  sales_only: "Tylko sprzedawcy",
};

const MAX_BODY = 5000;

function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Zwraca tylko imię + nazwisko (bez roli, bez maila).
 * Priorytet: `authorName` (z bazy). Fallback: localpart maila → replace
 * znaków rozdzielających na spacje → capitalize.
 */
function displayName(
  authorName: string | null,
  authorEmail: string | null,
): string {
  if (authorName && authorName.trim()) return authorName.trim();
  if (authorEmail) {
    const local = (authorEmail.split("@")[0] ?? authorEmail)
      .replace(/[._-]+/g, " ")
      .trim();
    if (local) {
      return local.split(/\s+/).filter(Boolean).map(capitalize).join(" ");
    }
  }
  return "—";
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline">$1</a>',
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
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

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

export function TeamCommunicationTab({
  serviceId,
  currentUserEmail,
  viewerRole = "service",
}: Props) {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Defaultowo "team" — najczęstszy przypadek.
  const [visibility, setVisibility] = useState<Visibility>("team");
  // Wave 22 / F9 — opcje widoczności filtrowane per rola (serwisant nie widzi
  // "tylko sprzedawcy" itd.). Memoize żeby radio nie re-renderowało
  // z każdym tickiem.
  const visibilityOptions = useMemo(
    () => visibilityOptionsForRole(viewerRole),
    [viewerRole],
  );
  // Jeśli rola się zmieni, a obecna `visibility` nie jest już dozwolona
  // (np. user przełączył panel) — clamp do "team".
  useEffect(() => {
    if (!visibilityOptions.some((o) => o.value === visibility)) {
      setVisibility("team");
    }
  }, [visibilityOptions, visibility]);
  const [pinNew, setPinNew] = useState(false);
  const recentlyAddedIds = useRef<Set<string>>(new Set());

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/internal-notes?role=${encodeURIComponent(viewerRole)}`,
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
  }, [serviceId, viewerRole]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  // Real-time: SSE refetch na internal_note_* eventy.
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
          window.setTimeout(
            () => recentlyAddedIds.current.delete(noteId),
            5_000,
          );
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
      const r = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/internal-notes?role=${encodeURIComponent(viewerRole)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            visibility,
            pinned: pinNew,
            authorRole: viewerRole === "sales" ? "sales" : "service",
          }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      setDraft("");
      setPinNew(false);
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
        `/api/relay/services/${encodeURIComponent(serviceId)}/internal-notes/${encodeURIComponent(note.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !note.pinned }),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await fetchNotes();
    } catch {
      /* silent — SSE refetch i tak załapie */
    }
  };

  const remove = async (note: InternalNote) => {
    if (!confirm("Usunąć wpis?")) return;
    try {
      const r = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/internal-notes/${encodeURIComponent(note.id)}`,
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
    <div
      className="space-y-4"
      role="region"
      aria-label="Komunikacja zespołu — czat i notatki wewnętrzne"
    >
      {/* Composer u góry */}
      <div
        className="p-3 rounded-xl border space-y-3"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <label
          htmlFor="team-comm-draft"
          className="sr-only"
        >
          Treść wpisu
        </label>
        <textarea
          id="team-comm-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
          placeholder="Napisz do zespołu… (Cmd/Ctrl+Enter aby wysłać)"
          rows={3}
          maxLength={MAX_BODY}
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
          aria-describedby="team-comm-counter"
        />

        {/* Visibility radio group */}
        <fieldset className="space-y-1.5">
          <legend
            className="text-[10px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Widoczność wpisu
          </legend>
          <div
            role="radiogroup"
            aria-label="Wybierz dla kogo widoczny będzie wpis"
            className="flex flex-wrap gap-1.5"
          >
            {visibilityOptions.map((opt) => {
              const Icon = opt.icon;
              const checked = visibility === opt.value;
              return (
                <label
                  key={opt.value}
                  className="cursor-pointer"
                  title={opt.description}
                >
                  <input
                    type="radio"
                    name="team-comm-visibility"
                    value={opt.value}
                    checked={checked}
                    onChange={() => setVisibility(opt.value)}
                    className="sr-only"
                    aria-label={opt.label}
                  />
                  <span
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors"
                    style={{
                      borderColor: checked
                        ? "var(--accent)"
                        : "var(--border-subtle)",
                      background: checked
                        ? "rgba(99, 102, 241, 0.15)"
                        : "var(--bg-surface)",
                      color: checked ? "var(--text-main)" : "var(--text-muted)",
                    }}
                  >
                    <Icon className="w-3 h-3" aria-hidden="true" />
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={pinNew}
              onChange={(e) => setPinNew(e.target.checked)}
              className="cursor-pointer"
            />
            <Pin className="w-3 h-3" aria-hidden="true" />
            <span style={{ color: "var(--text-muted)" }}>Przypnij wpis</span>
          </label>
          <span
            id="team-comm-counter"
            className="text-[10px]"
            style={{ color: "var(--text-muted)" }}
            aria-live="polite"
          >
            {draft.length} / {MAX_BODY}
          </span>
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
            Dodaj
          </button>
        </div>

        {submitError && (
          <p className="text-xs" style={{ color: "#ef4444" }} role="alert">
            {submitError}
          </p>
        )}
      </div>

      {/* Lista */}
      {loading && notes.length === 0 ? (
        <div className="flex justify-center py-8">
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: "var(--text-muted)" }}
            aria-label="Ładowanie wpisów"
          />
        </div>
      ) : error ? (
        <div
          className="p-3 rounded-xl border text-center text-sm"
          role="alert"
          style={{ borderColor: "#ef4444", color: "#ef4444" }}
        >
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
          Brak wpisów w komunikacji zespołu.
        </div>
      ) : (
        <ul
          className="space-y-2"
          aria-live="polite"
          aria-label="Komunikacja zespołu — aktualizowana na żywo"
        >
          {sorted.map((note) => {
            const name = displayName(note.authorName, note.authorEmail);
            const isOwn =
              !!note.authorEmail &&
              note.authorEmail.toLowerCase() ===
                currentUserEmail.toLowerCase();
            const isNew = recentlyAddedIds.current.has(note.id);
            return (
              <li
                key={note.id}
                className={`p-3 rounded-xl border transition-opacity duration-500 ${
                  isNew ? "animate-pulse" : ""
                }`}
                style={{
                  borderColor: note.pinned
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  background: "var(--bg-card)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold"
                    style={{
                      background: "var(--bg-surface)",
                      color: "var(--text-main)",
                    }}
                    aria-hidden="true"
                  >
                    {initialsFor(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--text-main)" }}
                      >
                        {name}
                      </span>
                      {/* Visibility chip */}
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                        style={{
                          background: "var(--bg-surface)",
                          color: "var(--text-muted)",
                        }}
                        title={`Widoczność: ${VISIBILITY_LABEL[note.visibility]}`}
                      >
                        {note.visibility === "team" ? (
                          <Users className="w-2.5 h-2.5" />
                        ) : note.visibility === "service_only" ? (
                          <Wrench className="w-2.5 h-2.5" />
                        ) : (
                          <EyeOff className="w-2.5 h-2.5" />
                        )}
                        {VISIBILITY_LABEL[note.visibility]}
                      </span>
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
                        title={new Date(note.createdAt).toLocaleString("pl-PL")}
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
                          note.pinned ? "Odepnij wpis" : "Przypnij wpis"
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
                        aria-label="Usuń wpis"
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
