"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, MessageSquare, RefreshCw, FileDown, Inbox } from "lucide-react";
import { Card, CardHeader, Button, Spinner, Badge } from "@/components/ui";

interface ThreadItem {
  kind: "mail" | "chat";
  id: string;
  timestamp: number;
  subject: string;
  direction?: "outbound" | "inbound";
  status?: number | string;
  from?: string;
  to?: string;
  messageCount?: number;
}

interface MailDetail {
  subject: string;
  from?: string;
  to?: string;
  htmlBody?: string;
  plainBody?: string;
  attachments?: Array<{ id: string; filename: string; contentType: string; size: number }>;
  timestamp: number;
}

interface ChatMessage {
  id: number;
  content: string;
  messageType: number;
  senderName?: string;
  createdAt: string;
  attachments?: Array<{ id: number; filename?: string; fileType?: string }>;
}

type DetailResp =
  | { kind: "mail"; detail: MailDetail }
  | { kind: "chat"; conversationId: number; messages: ChatMessage[] };

/**
 * Tab "Korespondencja" w /account — pokazuje WŁASNĄ korespondencję usera
 * (mail z Postal + Chatwoot) na podstawie session.user.email. Backend
 * filtruje sender/recipient. UI 2-kolumnowa: lista wątków + detail.
 */
export function CorrespondenceTab() {
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [hasMail, setHasMail] = useState(true);
  const [hasChat, setHasChat] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResp | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/account/correspondence/messages", {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      const data = j.data ?? j;
      setItems(data.items ?? []);
      setHasMail(data.hasMailSource !== false);
      setHasChat(data.hasChatSource !== false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    void (async () => {
      try {
        const r = await fetch(
          `/api/account/correspondence/message/${encodeURIComponent(selectedId)}`,
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
        setDetail(j.data ?? j);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [selectedId]);

  const formatDate = (t: number) =>
    new Date(t).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const filtered = useMemo(() => items, [items]);

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex items-center justify-between">
          <CardHeader
            icon={<Mail className="w-5 h-5 text-[var(--accent)]" />}
            title="Korespondencja"
            description="Cały Twój ruch mailingowy + komunikacja Chatwoot."
          />
          <Button onClick={() => void load()} variant="ghost" size="sm">
            <RefreshCw className="w-4 h-4 mr-1" />
            Odśwież
          </Button>
        </div>

        {!hasMail && !hasChat && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            Brak skonfigurowanych źródeł danych (Postal/Chatwoot). Skontaktuj się
            z administratorem.
          </div>
        )}

        {err && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {err}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-[minmax(300px,2fr)_3fr] gap-4">
        <Card padding="sm" className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-[var(--text-muted)]">
              <Inbox className="w-8 h-8 mb-2 opacity-50" />
              <p>Brak korespondencji.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(it.id)}
                    className={`w-full text-left p-3 hover:bg-[var(--bg-surface)] transition-colors ${selectedId === it.id ? "bg-[var(--bg-surface)]" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                        {it.kind === "mail" ? (
                          <Mail className="w-3 h-3" />
                        ) : (
                          <MessageSquare className="w-3 h-3" />
                        )}
                        {it.kind === "mail"
                          ? it.direction === "outbound"
                            ? "Wysłane"
                            : "Odebrane"
                          : `Czat (${it.messageCount ?? 0})`}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        {formatDate(it.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-main)] font-medium truncate">
                      {it.subject}
                    </p>
                    {(it.from || it.to) && (
                      <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {it.kind === "mail" && it.direction === "outbound"
                          ? `→ ${it.to ?? "?"}`
                          : `${it.from ?? "?"}`}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md" className="max-h-[70vh] overflow-y-auto">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-[var(--text-muted)]">
              <Mail className="w-10 h-10 mb-3 opacity-30" />
              <p>Wybierz wątek po lewej, aby zobaczyć szczegóły.</p>
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : !detail ? null : detail.kind === "mail" ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-main)]">
                  {detail.detail.subject}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Od: {detail.detail.from} · Do: {detail.detail.to ?? "—"}
                </p>
              </div>
              {detail.detail.htmlBody ? (
                <iframe
                  sandbox="allow-popups allow-same-origin"
                  srcDoc={detail.detail.htmlBody}
                  className="w-full min-h-[400px] rounded-lg border border-[var(--border-subtle)] bg-white"
                  title="Treść e-mail"
                />
              ) : detail.detail.plainBody ? (
                <pre className="whitespace-pre-wrap text-sm text-[var(--text-main)] p-3 rounded-lg bg-[var(--bg-surface)] font-mono">
                  {detail.detail.plainBody}
                </pre>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">
                  Treść niedostępna.
                </p>
              )}
              {(detail.detail.attachments ?? []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Załączniki
                  </p>
                  {detail.detail.attachments!.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/account/correspondence/attachment/${encodeURIComponent(`mail:${selectedId.replace("mail:", "")}:${a.id}`)}`}
                      className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] text-xs"
                    >
                      <FileDown className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span className="flex-1 truncate">{a.filename}</span>
                      <span className="text-[var(--text-muted)] font-mono">
                        {(a.size / 1024).toFixed(1)} KB
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">
                Czat #{detail.conversationId}
              </h3>
              <ul className="space-y-2">
                {detail.messages.map((m) => (
                  <li
                    key={m.id}
                    className={`p-3 rounded-lg ${m.messageType === 0 ? "bg-[var(--bg-surface)]" : "bg-[var(--accent)]/10 ml-8"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[var(--text-main)]">
                        {m.senderName ?? (m.messageType === 0 ? "Klient" : "Agent")}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        {new Date(m.createdAt).toLocaleString("pl-PL")}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-main)] whitespace-pre-wrap">
                      {m.content}
                    </p>
                    {(m.attachments ?? []).length > 0 && (
                      <div className="mt-2 space-y-1">
                        {m.attachments!.map((a) => (
                          <a
                            key={a.id}
                            href={`/api/account/correspondence/attachment/${encodeURIComponent(`chat:${a.id}`)}`}
                            className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                          >
                            <FileDown className="w-3 h-3" />
                            {a.filename ?? `załącznik #${a.id}`}
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {detail.messages.length === 0 && (
                <p className="text-sm text-[var(--text-muted)] italic">
                  Brak wiadomości w czacie.
                </p>
              )}
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <Badge tone="neutral">{detail.messages.length} wiadomości</Badge>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
