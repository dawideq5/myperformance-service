"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Loader2, Send, UserCog, UserRound } from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";

type AuthorRole = "sales" | "service";

interface InternalMessage {
  id: string;
  serviceId: string;
  body: string;
  authorEmail: string;
  authorRole: AuthorRole;
  createdAt: string;
  readByRecipientAt: string | null;
}

interface CzatZespoluTabProps {
  service: ServiceTicket;
  /** "service" gdy ten panel = serwisant; "sales" gdy panel sprzedawcy. */
  defaultRole?: AuthorRole;
}

interface ApiListResponse {
  messages?: InternalMessage[];
  viewerRole?: AuthorRole;
  error?: string;
}

interface ApiCreateResponse {
  message?: InternalMessage;
  error?: string;
}

const MAX_BODY = 4096;
const POLL_MS = 5000;

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
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
  return new Date(iso).toLocaleString("pl-PL");
}

function authorLabel(role: AuthorRole, email: string): string {
  const ROLE_LABEL = role === "sales" ? "Sprzedawca" : "Serwisant";
  return `${ROLE_LABEL} · ${email}`;
}

export function CzatZespoluTab({
  service,
  defaultRole = "service",
}: CzatZespoluTabProps) {
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [viewerRole, setViewerRole] = useState<AuthorRole>(defaultRole);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const [counter, setCounter] = useState(0); // wyzwalacz refetch

  const recipientLabel = useMemo(() => {
    if (viewerRole === "service") {
      return service.receivedBy
        ? `do sprzedawcy (${service.receivedBy})`
        : "do sprzedawcy";
    }
    return service.assignedTechnician
      ? `do serwisanta (${service.assignedTechnician})`
      : "do serwisanta";
  }, [viewerRole, service.receivedBy, service.assignedTechnician]);

  const fetchMessages = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      try {
        const r = await fetch(
          `/api/relay/services/${encodeURIComponent(service.id)}/internal-messages`,
          { signal },
        );
        const j = (await r.json().catch(() => null)) as ApiListResponse | null;
        if (!r.ok) {
          setError(j?.error ?? `HTTP ${r.status}`);
          return;
        }
        setMessages(Array.isArray(j?.messages) ? j!.messages! : []);
        if (j?.viewerRole === "sales" || j?.viewerRole === "service") {
          setViewerRole(j.viewerRole);
        }
        setError(null);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Błąd sieci");
      }
    },
    [service.id],
  );

  // Initial load
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetchMessages(ctrl.signal).finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [fetchMessages]);

  // Polling co 5s — w Phase 1D zamienione na SSE subscribe.
  useEffect(() => {
    const t = window.setInterval(() => {
      setCounter((n) => n + 1);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (counter === 0) return;
    const ctrl = new AbortController();
    void fetchMessages(ctrl.signal);
    return () => ctrl.abort();
  }, [counter, fetchMessages]);

  // Composer u góry → najnowsze tuż pod nim. Lista renderuje DESC (newest
  // first), więc scroll-to-top na nową wiadomość zamiast scroll-to-bottom.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [messages.length]);

  // Mark-read fire-and-forget przy każdym otwarciu / nowej wiadomości od
  // drugiej strony.
  useEffect(() => {
    const lastIncomingUnread = messages.find(
      (m) => m.authorRole !== viewerRole && !m.readByRecipientAt,
    );
    if (!lastIncomingUnread) return;
    void fetch(
      `/api/relay/services/${encodeURIComponent(service.id)}/internal-messages/mark-read`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerRole }),
      },
    ).catch(() => undefined);
  }, [messages, viewerRole, service.id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/relay/services/${encodeURIComponent(service.id)}/internal-messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed, authorRole: viewerRole }),
        },
      );
      const j = (await r.json().catch(() => null)) as ApiCreateResponse | null;
      if (!r.ok || !j?.message) {
        setError(j?.error ?? `HTTP ${r.status}`);
        return;
      }
      setMessages((prev) => [...prev, j.message!]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full min-h-[400px]"
      role="region"
      aria-label="Czat zespołu — wewnętrzna komunikacja sprzedawca-serwisant"
    >
      <div
        className="px-4 py-2 border-b text-xs"
        style={{
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        Wewnętrzna komunikacja zespołu (klient nie widzi). Pisz {recipientLabel}.
      </div>

      {/* Composer u góry — zawsze widoczny bez konieczności przewijania */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 p-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <label htmlFor="czat-zespolu-textarea" className="sr-only">
          Treść wiadomości do zespołu
        </label>
        <textarea
          id="czat-zespolu-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSubmit(e as unknown as FormEvent);
            }
          }}
          rows={2}
          maxLength={MAX_BODY}
          placeholder="Napisz do zespołu…"
          className="flex-1 px-3 py-2 text-sm rounded-lg border resize-none"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
          aria-describedby="czat-zespolu-counter"
        />
        <div
          id="czat-zespolu-counter"
          className="text-[10px] mr-1 self-end mb-1"
          style={{ color: "var(--text-muted)" }}
          aria-live="polite"
        >
          {draft.length}/{MAX_BODY}
        </div>
        <button
          type="submit"
          disabled={submitting || draft.trim().length === 0}
          className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          style={{
            background: "var(--accent)",
            color: "#fff",
          }}
          aria-label="Wyślij wiadomość do zespołu"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Wyślij
        </button>
      </form>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2
              className="w-5 h-5 animate-spin"
              style={{ color: "var(--text-muted)" }}
              aria-label="Ładowanie wiadomości"
            />
          </div>
        ) : messages.length === 0 ? (
          <div
            className="text-center text-sm py-12"
            style={{ color: "var(--text-muted)" }}
          >
            Brak wiadomości w czacie zespołu.
          </div>
        ) : (
          [...messages].reverse().map((m) => {
            const isSelf = m.authorRole === viewerRole;
            const Icon = m.authorRole === "service" ? UserCog : UserRound;
            return (
              <div
                key={m.id}
                className={`flex gap-2 ${isSelf ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isSelf
                      ? "var(--accent)"
                      : "var(--bg-surface)",
                    color: isSelf ? "#fff" : "var(--text-muted)",
                  }}
                  aria-hidden
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div
                  className="max-w-[78%] flex flex-col"
                  style={{ alignItems: isSelf ? "flex-end" : "flex-start" }}
                >
                  <div
                    className="px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words"
                    style={{
                      background: isSelf
                        ? "var(--accent)"
                        : "var(--bg-card)",
                      color: isSelf ? "#fff" : "var(--text-main)",
                      border: isSelf
                        ? "none"
                        : "1px solid var(--border-subtle)",
                    }}
                  >
                    {m.body}
                  </div>
                  <p
                    className="text-[10px] mt-1 px-1"
                    style={{ color: "var(--text-muted)" }}
                    title={authorLabel(m.authorRole, m.authorEmail)}
                  >
                    {authorLabel(m.authorRole, m.authorEmail)} ·{" "}
                    {formatRelative(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 p-2 rounded-lg text-xs"
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

    </div>
  );
}
