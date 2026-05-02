"use client";

/**
 * Wave 21 / Faza 1D — agregator komunikacji z klientem.
 *
 * Pokazuje wszystkie kanały kontaktu chronologicznie (DESC):
 *   - Chatwoot conversations (deep-link do panelu CSM)
 *   - Postal emails (z message ID do skopiowania)
 *   - Off-channel kontakty (telefon / osobiście / inne) — `mp_service_customer_contacts`
 *
 * Plus button "Dodaj notatkę o kontakcie" → modal `RecordContactModal`
 * z polami: kanał (radio), kierunek (radio), notatka, data kontaktu.
 *
 * Zastępuje `ChatwootDeepLink` w `KlientTab`.
 *
 * Real-time: SSE `customer_contact_recorded` + `customer_message_sent` +
 * `chat_message_received` → re-fetch.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Filter,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import type { CommunicationResponse } from "@/lib/serwisant/types";
import { subscribeToService } from "@/lib/sse-client";

interface Props {
  serviceId: string;
  customerEmail?: string;
  customerPhone?: string;
  /**
   * Token zmienny — kiedy parent go inkrementuje, sekcja re-fetchuje.
   * Używane np. po wysłaniu wiadomości z CustomerMessageSender.
   */
  refreshKey?: number;
}

type Channel = "phone" | "in_person" | "other";
type Direction = "inbound" | "outbound";

interface UnifiedEntry {
  /** Stable id dla React key. */
  key: string;
  kind: "chatwoot" | "email" | "contact_phone" | "contact_in_person" | "contact_other";
  ts: number;
  /** Renderable react node. */
  body: React.ReactNode;
}

const CHANNEL_FILTER_OPTIONS: {
  value: "all" | "chatwoot" | "email" | "contact";
  label: string;
}[] = [
  { value: "all", label: "Wszystkie" },
  { value: "chatwoot", label: "Chatwoot" },
  { value: "email", label: "E-mail" },
  { value: "contact", label: "Telefon / osobiście" },
];

function formatTs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("pl-PL");
}

function chatwootIcon() {
  return <MessageSquare className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
}

function emailIcon() {
  return <Mail className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
}

function contactIcon(channel: Channel) {
  if (channel === "phone") {
    return <Phone className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
  }
  if (channel === "in_person") {
    return <User className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
  }
  return <MessageCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
}

const CHANNEL_LABEL: Record<Channel, string> = {
  phone: "Telefon",
  in_person: "Osobiście",
  other: "Inny kontakt",
};

const DIRECTION_LABEL: Record<Direction, string> = {
  inbound: "Przychodzący",
  outbound: "Wychodzący",
};

export function CustomerCommunicationLog({
  serviceId,
  customerEmail,
  customerPhone,
  refreshKey = 0,
}: Props) {
  const [data, setData] = useState<CommunicationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "chatwoot" | "email" | "contact">(
    "all",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/communication`,
      );
      const json = (await res.json()) as
        | (CommunicationResponse & { error?: string })
        | null;
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setData({
        chatwoot: Array.isArray(json?.chatwoot) ? json!.chatwoot : [],
        email: Array.isArray(json?.email) ? json!.email : [],
        customerContacts: Array.isArray(json?.customerContacts)
          ? json!.customerContacts
          : [],
        meta: json?.meta,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się pobrać komunikacji",
      );
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshKey]);

  // Real-time subskrypcja: customer_contact_recorded + chat/email events.
  useEffect(() => {
    const unsub = subscribeToService(serviceId, (evt) => {
      if (
        evt.type === "customer_contact_recorded" ||
        evt.type === "customer_message_sent" ||
        evt.type === "chat_message_received"
      ) {
        void fetchData();
      }
    });
    return unsub;
  }, [serviceId, fetchData]);

  const copyMessageId = async (id: number) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(String(id));
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* noop */
    }
  };

  const unified = useMemo<UnifiedEntry[]>(() => {
    if (!data) return [];
    const entries: UnifiedEntry[] = [];

    if (filter === "all" || filter === "chatwoot") {
      for (const c of data.chatwoot) {
        const ms =
          typeof c.lastMessageAt === "number"
            ? c.lastMessageAt > 1e12
              ? c.lastMessageAt
              : c.lastMessageAt * 1000
            : 0;
        entries.push({
          key: `cw-${c.id}`,
          kind: "chatwoot",
          ts: ms,
          body: (
            <a
              href={c.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-2.5 rounded-xl border transition-colors hover:border-[var(--accent)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              <span
                className="mt-0.5"
                style={{ color: "var(--text-muted)" }}
                aria-hidden="true"
              >
                {chatwootIcon()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold">Chatwoot</span>
                  <span className="text-xs font-mono">#{c.id}</span>
                  <span
                    className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(99,102,241,0.1)",
                      color: "var(--accent)",
                    }}
                  >
                    {c.status}
                  </span>
                  {c.unreadCount > 0 && (
                    <span
                      className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#fca5a5",
                      }}
                    >
                      {c.unreadCount} nowe
                    </span>
                  )}
                  <span
                    className="text-[10px] ml-auto"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {ms ? formatTs(ms) : ""}
                  </span>
                </div>
                {c.lastMessagePreview && (
                  <p
                    className="text-xs mt-1 line-clamp-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {c.lastMessagePreview}
                  </p>
                )}
              </div>
              <ExternalLink
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: "var(--text-muted)" }}
                aria-hidden="true"
              />
            </a>
          ),
        });
      }
    }

    if (filter === "all" || filter === "email") {
      for (const m of data.email) {
        const ms = m.timestamp > 1e12 ? m.timestamp : m.timestamp * 1000;
        const isBounce = m.bounce === true;
        entries.push({
          key: `mail-${m.id}`,
          kind: "email",
          ts: ms,
          body: (
            <div
              className="flex items-start gap-3 p-2.5 rounded-xl border"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              <span
                className="mt-0.5"
                style={{ color: "var(--text-muted)" }}
                aria-hidden="true"
              >
                {emailIcon()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold">E-mail</span>
                  <span className="text-xs font-mono">#{m.id}</span>
                  <span
                    className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: isBounce
                        ? "rgba(239, 68, 68, 0.15)"
                        : "rgba(34, 197, 94, 0.15)",
                      color: isBounce ? "#fca5a5" : "#86efac",
                    }}
                  >
                    {isBounce ? "bounce" : m.status || "—"}
                  </span>
                  <span
                    className="text-[10px] ml-auto"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatTs(ms)}
                  </span>
                </div>
                <p
                  className="text-xs mt-1 truncate"
                  title={m.subject}
                  style={{ color: "var(--text-main)" }}
                >
                  {m.subject || "(bez tematu)"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyMessageId(m.id)}
                className="flex-shrink-0 p-1.5 rounded-md text-[11px] flex items-center gap-1"
                style={{
                  background:
                    copiedId === m.id
                      ? "rgba(34, 197, 94, 0.15)"
                      : "var(--bg-card)",
                  color:
                    copiedId === m.id ? "#86efac" : "var(--text-muted)",
                }}
                aria-label={`Skopiuj message ID ${m.id}`}
                title="Skopiuj messageId"
              >
                {copiedId === m.id ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                ID
              </button>
            </div>
          ),
        });
      }
    }

    if (filter === "all" || filter === "contact") {
      for (const c of data.customerContacts ?? []) {
        const ms = new Date(c.contactedAt).getTime();
        const channel = c.channel;
        const direction = c.direction;
        entries.push({
          key: `cc-${c.id}`,
          kind:
            channel === "phone"
              ? "contact_phone"
              : channel === "in_person"
                ? "contact_in_person"
                : "contact_other",
          ts: Number.isFinite(ms) ? ms : 0,
          body: (
            <div
              className="flex items-start gap-3 p-2.5 rounded-xl border"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              <span
                className="mt-0.5"
                style={{ color: "var(--text-muted)" }}
                aria-hidden="true"
              >
                {contactIcon(channel)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold">
                    {CHANNEL_LABEL[channel]}
                  </span>
                  {direction && (
                    <span
                      className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--bg-card)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {DIRECTION_LABEL[direction]}
                    </span>
                  )}
                  {c.recordedByName && (
                    <span
                      className="text-[10px] truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      · {c.recordedByName}
                    </span>
                  )}
                  <span
                    className="text-[10px] ml-auto"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {Number.isFinite(ms) ? formatTs(ms) : "—"}
                  </span>
                </div>
                <p
                  className="text-xs mt-1 break-words whitespace-pre-wrap"
                  style={{ color: "var(--text-main)" }}
                >
                  {c.note}
                </p>
              </div>
            </div>
          ),
        });
      }
    }

    entries.sort((a, b) => b.ts - a.ts);
    return entries;
  }, [data, filter, copiedId]);

  const totalCount =
    (data?.chatwoot.length ?? 0) +
    (data?.email.length ?? 0) +
    (data?.customerContacts?.length ?? 0);

  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-main)",
      }}
      aria-labelledby="customer-comm-log-heading"
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
          aria-expanded={expanded}
          aria-controls="customer-comm-log-body"
        >
          <ChevronDown
            className="w-4 h-4 transition-transform flex-shrink-0"
            style={{
              color: "var(--text-muted)",
              transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <h3
            id="customer-comm-log-heading"
            className="text-sm font-semibold truncate"
          >
            Komunikacja z klientem
          </h3>
          {!loading && !error && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-muted)",
              }}
            >
              {totalCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5"
          style={{
            background: "var(--accent)",
            color: "#fff",
          }}
          aria-label="Dodaj notatkę o kontakcie z klientem"
          title="Dodaj notatkę o kontakcie (telefoniczny / osobisty)"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          Dodaj notatkę
        </button>
        <button
          type="button"
          onClick={() => void fetchData()}
          disabled={loading}
          className="p-1.5 rounded-lg disabled:opacity-50"
          style={{ color: "var(--text-muted)" }}
          aria-label="Odśwież komunikację"
          title="Odśwież"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </div>

      {expanded && (
        <div id="customer-comm-log-body" className="p-4 space-y-3">
          {/* Filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter
              className="w-3 h-3"
              style={{ color: "var(--text-muted)" }}
              aria-hidden="true"
            />
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Filtr kanału:
            </span>
            <div role="radiogroup" aria-label="Filtr kanału komunikacji" className="flex gap-1">
              {CHANNEL_FILTER_OPTIONS.map((opt) => {
                const active = filter === opt.value;
                return (
                  <label key={opt.value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="customer-comm-filter"
                      value={opt.value}
                      checked={active}
                      onChange={() => setFilter(opt.value)}
                      className="sr-only"
                    />
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full border"
                      style={{
                        background: active
                          ? "rgba(99, 102, 241, 0.15)"
                          : "var(--bg-surface)",
                        borderColor: active
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                        color: active ? "var(--text-main)" : "var(--text-muted)",
                      }}
                    >
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Customer identity hint */}
          {(customerEmail || customerPhone) && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Wyszukiwanie po:{" "}
              {customerEmail ? (
                <span className="font-mono">{customerEmail}</span>
              ) : null}
              {customerEmail && customerPhone ? " · " : ""}
              {customerPhone ? (
                <span className="font-mono">{customerPhone}</span>
              ) : null}
            </p>
          )}

          {loading && !data ? (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Ładowanie kanałów…
            </div>
          ) : error ? (
            <div
              role="alert"
              className="p-3 rounded-lg flex items-start gap-2 text-sm"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                color: "#fca5a5",
              }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : unified.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Brak wpisów w komunikacji
              {filter !== "all" ? " dla wybranego filtra" : ""}.
            </p>
          ) : (
            <ul role="list" className="space-y-1.5">
              {unified.map((entry) => (
                <li key={entry.key}>{entry.body}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {modalOpen && (
        <RecordContactModal
          serviceId={serviceId}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void fetchData();
          }}
        />
      )}
    </section>
  );
}

interface ModalProps {
  serviceId: string;
  onClose: () => void;
  onSaved: () => void;
}

function nowLocalIso(): string {
  // datetime-local oczekuje formatu YYYY-MM-DDTHH:mm bez 'Z'.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function RecordContactModal({ serviceId, onClose, onSaved }: ModalProps) {
  const [channel, setChannel] = useState<Channel>("phone");
  const [direction, setDirection] = useState<Direction>("outbound");
  const [note, setNote] = useState("");
  const [contactedAt, setContactedAt] = useState<string>(nowLocalIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc — zamknij; focus trap minimalny (auto-focus na pierwszym polu).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = note.trim();
    if (!trimmed) {
      setError("Notatka jest wymagana");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const isoAt = contactedAt
        ? new Date(contactedAt).toISOString()
        : new Date().toISOString();
      const r = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/customer-contacts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            direction,
            note: trimmed,
            contactedAt: isoAt,
          }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-contact-heading"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border overflow-hidden"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <h2 id="record-contact-heading" className="text-sm font-semibold">
            Notatka o kontakcie z klientem
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Channel radio */}
          <fieldset>
            <legend
              className="text-[10px] uppercase tracking-wider font-semibold mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              Kanał kontaktu
            </legend>
            <div
              role="radiogroup"
              aria-label="Wybierz kanał kontaktu"
              className="flex flex-wrap gap-1.5"
            >
              {(["phone", "in_person", "other"] as Channel[]).map((c) => {
                const active = channel === c;
                const Icon =
                  c === "phone" ? Phone : c === "in_person" ? User : MessageCircle;
                return (
                  <label key={c} className="cursor-pointer">
                    <input
                      type="radio"
                      name="record-contact-channel"
                      value={c}
                      checked={active}
                      onChange={() => setChannel(c)}
                      className="sr-only"
                      aria-label={CHANNEL_LABEL[c]}
                    />
                    <span
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors"
                      style={{
                        borderColor: active
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                        background: active
                          ? "rgba(99, 102, 241, 0.15)"
                          : "var(--bg-surface)",
                        color: active
                          ? "var(--text-main)"
                          : "var(--text-muted)",
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      {CHANNEL_LABEL[c]}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Direction radio */}
          <fieldset>
            <legend
              className="text-[10px] uppercase tracking-wider font-semibold mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              Kierunek
            </legend>
            <div
              role="radiogroup"
              aria-label="Wybierz kierunek kontaktu"
              className="flex flex-wrap gap-1.5"
            >
              {(["inbound", "outbound"] as Direction[]).map((d) => {
                const active = direction === d;
                return (
                  <label key={d} className="cursor-pointer">
                    <input
                      type="radio"
                      name="record-contact-direction"
                      value={d}
                      checked={active}
                      onChange={() => setDirection(d)}
                      className="sr-only"
                    />
                    <span
                      className="px-3 py-1.5 rounded-lg text-xs border transition-colors"
                      style={{
                        borderColor: active
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                        background: active
                          ? "rgba(99, 102, 241, 0.15)"
                          : "var(--bg-surface)",
                        color: active
                          ? "var(--text-main)"
                          : "var(--text-muted)",
                      }}
                    >
                      {DIRECTION_LABEL[d]}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Note */}
          <div>
            <label
              htmlFor="record-contact-note"
              className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              Treść notatki
            </label>
            <textarea
              id="record-contact-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 5000))}
              placeholder="Np. Klient pytał o czas naprawy. Powiedziałem 2-3 dni."
              rows={4}
              autoFocus
              className="w-full px-3 py-2 rounded-lg text-sm resize-y"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-main)",
                border: "1px solid var(--border-subtle)",
              }}
              required
              aria-required="true"
            />
            <p
              className="text-[10px] mt-1 text-right"
              style={{ color: "var(--text-muted)" }}
            >
              {note.length} / 5000
            </p>
          </div>

          {/* Contacted at */}
          <div>
            <label
              htmlFor="record-contact-when"
              className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              Data kontaktu
            </label>
            <input
              id="record-contact-when"
              type="datetime-local"
              value={contactedAt}
              onChange={(e) => setContactedAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-main)",
                border: "1px solid var(--border-subtle)",
              }}
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: "#ef4444" }} role="alert">
              {error}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={submitting || !note.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Zapisz notatkę
          </button>
        </div>
      </form>
    </div>
  );
}
