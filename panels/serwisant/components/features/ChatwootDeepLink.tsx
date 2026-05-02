"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import type { CommunicationResponse } from "@/lib/serwisant/types";

interface ChatwootDeepLinkProps {
  serviceId: string;
  customerEmail?: string;
  customerPhone?: string;
  defaultExpanded?: boolean;
  /**
   * Token zmienny — kiedy parent go inkrementuje, sekcja re-fetchuje
   * komunikację. Używane np. po wysłaniu wiadomości z CustomerMessageSender
   * albo po SSE evencie `customer_message_sent`.
   */
  refreshKey?: number;
}

/**
 * Sekcja "Komunikacja z klientem" — listuje konwersacje Chatwoot
 * (z deep linkami do panelu CSM) oraz emaile Postal (z możliwością
 * skopiowania messageId, np. żeby wkleić w AnnexBuilder).
 *
 * Standalone — fetchuje `/api/relay/services/${id}/communication`
 * (route z Phase 1, zwraca `{ chatwoot: [...], email: [...] }`).
 */
export function ChatwootDeepLink({
  serviceId,
  customerEmail,
  customerPhone,
  defaultExpanded = true,
  refreshKey = 0,
}: ChatwootDeepLinkProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [data, setData] = useState<CommunicationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

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
        meta: json?.meta,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nie udało się pobrać komunikacji",
      );
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void fetchData();
    // Refresh kiedy parent zwiększy refreshKey (np. po wysyłce wiadomości
    // albo SSE evencie). fetchData stabilne via useCallback([serviceId]).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshKey]);

  const copyMessageId = async (id: number) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(String(id));
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* noop — best-effort */
    }
  };

  const chatwootCount = data?.chatwoot.length ?? 0;
  const emailCount = data?.email.length ?? 0;

  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-main)",
      }}
      aria-labelledby="chatwoot-deeplink-heading"
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left flex-1"
          aria-expanded={expanded}
          aria-controls="chatwoot-deeplink-body"
        >
          <ChevronDown
            className="w-4 h-4 transition-transform"
            style={{
              color: "var(--text-muted)",
              transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <h3
            id="chatwoot-deeplink-heading"
            className="text-sm font-semibold"
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
              {chatwootCount} czat · {emailCount} email
            </span>
          )}
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
        <div id="chatwoot-deeplink-body" className="p-4 space-y-4">
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
          ) : (
            <>
              {/* Customer identity hint */}
              {(customerEmail || customerPhone) && (
                <p
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
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

              {/* Chatwoot conversations */}
              <div>
                <h4
                  className="text-[11px] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chatwoot ({chatwootCount})
                </h4>
                {chatwootCount === 0 ? (
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Brak konwersacji w Chatwoot dla tego klienta.
                  </p>
                ) : (
                  <ul role="list" className="space-y-1.5">
                    {data!.chatwoot.map((c) => (
                      <li key={c.id}>
                        <a
                          href={c.deepLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start justify-between gap-2 p-2.5 rounded-xl border transition-colors hover:border-[var(--accent)]"
                          style={{
                            background: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-main)",
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono">
                                #{c.id}
                              </span>
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
                            </div>
                            {c.lastMessagePreview && (
                              <p
                                className="text-xs mt-1 line-clamp-2"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {c.lastMessagePreview}
                              </p>
                            )}
                            {c.lastMessageAt && (
                              <p
                                className="text-[10px] mt-0.5"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {new Date(
                                  c.lastMessageAt > 1e12
                                    ? c.lastMessageAt
                                    : c.lastMessageAt * 1000,
                                ).toLocaleString("pl-PL")}
                              </p>
                            )}
                          </div>
                          <ExternalLink
                            className="w-4 h-4 flex-shrink-0 mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                            aria-hidden
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Postal emails */}
              <div>
                <h4
                  className="text-[11px] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Mail className="w-3.5 h-3.5" />
                  Postal — emaile ({emailCount})
                </h4>
                {emailCount === 0 ? (
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Brak emaili dla tego klienta.
                  </p>
                ) : (
                  <ul role="list" className="space-y-1.5">
                    {data!.email.map((m) => {
                      const ts = new Date(
                        m.timestamp > 1e12
                          ? m.timestamp
                          : m.timestamp * 1000,
                      ).toLocaleString("pl-PL");
                      const isBounce = m.bounce === true;
                      return (
                        <li
                          key={m.id}
                          className="flex items-start justify-between gap-2 p-2.5 rounded-xl border"
                          style={{
                            background: "var(--bg-surface)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-main)",
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-mono">
                                #{m.id}
                              </span>
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
                            </div>
                            <p
                              className="text-xs mt-1 truncate"
                              title={m.subject}
                            >
                              {m.subject || "(bez tematu)"}
                            </p>
                            <p
                              className="text-[10px] mt-0.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {ts}
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
                                copiedId === m.id
                                  ? "#86efac"
                                  : "var(--text-muted)",
                            }}
                            aria-label={`Skopiuj message ID ${m.id}`}
                            title="Skopiuj messageId"
                          >
                            {copiedId === m.id ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>OK</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>ID</span>
                              </>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
