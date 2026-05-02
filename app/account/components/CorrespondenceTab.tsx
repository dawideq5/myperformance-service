"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  MessageSquare,
  RefreshCw,
  FileDown,
  Inbox,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { Card, CardHeader, Button, Spinner, Badge } from "@/components/ui";

interface Conversation {
  id: number;
  inboxName: string;
  status: number | string;
  contactEmail: string | null;
  messageCount: number;
  updatedAt: string;
  createdAt: string;
}

interface ChatMessage {
  id: number;
  content: string;
  /** 0 = incoming (klient), 1 = outgoing (agent), 2 = activity, 3 = template */
  messageType: number;
  senderName?: string | null;
  senderType?: string | null; // "Contact" | "User" | "AgentBot"
  createdAt: string;
  attachments?: Array<{ id: number; filename?: string; fileType?: string }>;
}

interface ConversationDetail {
  conversationId: number;
  inboxName: string;
  status: number | string;
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle2; tone: "success" | "warning" | "neutral" | "danger" }
> = {
  open: { label: "Otwarty", icon: Clock, tone: "warning" },
  resolved: { label: "Rozwiązany", icon: CheckCircle2, tone: "success" },
  pending: { label: "Oczekujący", icon: Clock, tone: "warning" },
  snoozed: { label: "Wstrzymany", icon: Clock, tone: "neutral" },
  closed: { label: "Zamknięty", icon: XCircle, tone: "danger" },
};

function statusInfo(status: number | string) {
  const key =
    typeof status === "number"
      ? ["open", "resolved", "pending", "snoozed"][status] ?? "open"
      : String(status).toLowerCase();
  return STATUS_CONFIG[key] ?? STATUS_CONFIG.open;
}

function senderInitials(name?: string | null, fallback = "?"): string {
  const n = (name ?? fallback).trim();
  if (!n) return fallback;
  const parts = n.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

/** Sender label gdy nazwy nie ma — fallback po typie. */
function senderLabel(m: ChatMessage, isOutgoing: boolean): string {
  if (m.senderName?.trim()) return m.senderName.trim();
  if (m.senderType === "Contact") return "Klient";
  if (m.senderType === "User") return "Agent";
  if (m.senderType === "AgentBot") return "Bot";
  return isOutgoing ? "Agent" : "Klient";
}

/**
 * Tab "Korespondencja" w /account — historia czatów Chatwoot dla zalogowanego
 * usera. Lewa kolumna: lista konwersacji z ID, statusem, ostatnią datą.
 * Prawa: dymki messages — incoming po lewej, outgoing po prawej.
 */
export function CorrespondenceTab() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [hasChat, setHasChat] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/account/correspondence/messages", {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      const data = j.data ?? j;
      setConvs(data.conversations ?? []);
      setHasChat(data.hasChatSource !== false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/account/correspondence/message/${selected}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
        if (!cancelled) setDetail(j.data ?? j);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const sortedConvs = useMemo(
    () => [...convs].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [convs],
  );

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardHeader
            icon={<MessageSquare className="w-5 h-5 text-[var(--accent)]" />}
            title="Historia czatów"
            description="Twoja aktywność w Chatwoocie — wszystkie konwersacje z agentami wsparcia."
          />
          <Button onClick={() => void load()} variant="ghost" size="sm">
            <RefreshCw className="w-4 h-4 mr-1" />
            Odśwież
          </Button>
        </div>

        {!hasChat && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            Chatwoot nie jest skonfigurowany. Skontaktuj się z administratorem.
          </div>
        )}

        {err && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {err}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-[minmax(280px,1fr)_2fr] gap-4">
        {/* Lewa: lista konwersacji */}
        <Card padding="sm" className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : sortedConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-[var(--text-muted)]">
              <Inbox className="w-8 h-8 mb-2 opacity-50" />
              <p>Brak konwersacji.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {sortedConvs.map((c) => {
                const s = statusInfo(c.status);
                const StatusIcon = s.icon;
                const isActive = selected === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(c.id)}
                      className={`w-full text-left p-3 hover:bg-[var(--bg-surface)] transition-colors ${isActive ? "bg-[var(--bg-surface)]" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-mono text-[var(--text-muted)]">
                          #{c.id}
                        </span>
                        <Badge tone={s.tone}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {s.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-[var(--text-main)] font-medium truncate">
                        {c.inboxName}
                      </p>
                      <div className="flex items-center justify-between mt-1 text-[10px] text-[var(--text-muted)]">
                        <span>{c.messageCount} wiadomości</span>
                        <span className="font-mono">{formatDate(c.updatedAt)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Prawa: dymki */}
        <Card padding="md" className="max-h-[70vh] overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-[var(--text-muted)]">
              <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
              <p>Wybierz konwersację po lewej, aby zobaczyć przebieg rozmowy.</p>
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : !detail ? null : (
            <div className="space-y-4">
              {/* Header konwersacji */}
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-base font-semibold text-[var(--text-main)]">
                    {detail.inboxName}
                  </h3>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    Czat #{detail.conversationId}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Rozpoczęto: {formatDate(detail.createdAt)} ·{" "}
                  Aktualizacja: {formatDate(detail.updatedAt)}
                </p>
              </div>

              {/* Dymki */}
              {detail.messages.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] italic text-center py-8">
                  Brak wiadomości w czacie.
                </p>
              ) : (
                <ul className="space-y-3">
                  {detail.messages.map((m) => {
                    // messageType: 0 = klient (incoming), 1 = agent (outgoing).
                    // 2 (activity) i 3 (template) traktujemy jako system.
                    const isOutgoing = m.messageType === 1;
                    const isSystem = m.messageType === 2 || m.messageType === 3;
                    const label = senderLabel(m, isOutgoing);
                    const initials = senderInitials(label);

                    if (isSystem) {
                      return (
                        <li key={m.id} className="text-center">
                          <span className="inline-block px-3 py-1 rounded-full bg-[var(--bg-surface)] text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
                            {m.content || "Zdarzenie systemowe"}
                          </span>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={m.id}
                        className={`flex gap-2 ${isOutgoing ? "justify-end" : "justify-start"}`}
                      >
                        {!isOutgoing && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[10px] font-bold text-[var(--text-main)]">
                            {initials}
                          </div>
                        )}
                        <div
                          className={`max-w-[70%] flex flex-col ${isOutgoing ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`flex items-center gap-2 mb-0.5 text-[10px] ${isOutgoing ? "flex-row-reverse" : ""}`}
                          >
                            <span className="font-medium text-[var(--text-main)]">
                              {label}
                            </span>
                            <span className="font-mono text-[var(--text-muted)]">
                              {new Date(m.createdAt).toLocaleString("pl-PL", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div
                            className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                              isOutgoing
                                ? "bg-[var(--accent)]/15 text-[var(--text-main)] rounded-br-sm"
                                : "bg-[var(--bg-surface)] text-[var(--text-main)] rounded-bl-sm border border-[var(--border-subtle)]"
                            }`}
                          >
                            {m.content || (
                              <span className="italic text-[var(--text-muted)]">
                                (bez treści)
                              </span>
                            )}
                          </div>
                          {(m.attachments ?? []).length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {m.attachments!.map((a) => (
                                <a
                                  key={a.id}
                                  href={`/api/account/correspondence/attachment/${a.id}`}
                                  className="inline-flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
                                >
                                  <FileDown className="w-3 h-3" />
                                  {a.filename ?? `załącznik #${a.id}`}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        {isOutgoing && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30 flex items-center justify-center text-[10px] font-bold text-[var(--accent)]">
                            {initials}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
