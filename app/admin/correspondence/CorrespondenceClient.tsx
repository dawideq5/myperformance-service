"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Inbox,
  Mail,
  MessageCircle,
  RefreshCw,
} from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageShell,
  Spinner,
  useToast,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { EmailHtmlPreview } from "./EmailHtmlPreview";
import { AttachmentList, type Attachment } from "./AttachmentList";

// ── Typy zgodne z API ─────────────────────────────────────────────────────

interface VerifiedAccount {
  email: string;
  domain: string;
  description: string | null;
  size: number;
  state: string;
  isBlocked: boolean;
}

interface AccountsResponse {
  accounts: VerifiedAccount[];
  counters: Record<string, { mail: number; chat: number }>;
  configured: { ovh: boolean; postal: boolean; chatwoot: boolean };
}

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

interface MessagesResponse {
  email: string;
  items: ThreadItem[];
  hasMailSource: boolean;
  hasChatSource: boolean;
}

interface MailDetail {
  id: number;
  subject: string;
  from: string;
  to: string;
  status: string;
  direction: "outbound" | "inbound";
  timestamp: number;
  htmlBody: string | null;
  textBody: string | null;
  attachments: Array<{
    id?: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
}

interface ChatMessage {
  id: number;
  conversationId: number;
  messageType: number;
  content: string | null;
  contentType: string | null;
  senderType: string | null;
  senderName: string | null;
  createdAt: string;
  attachments: Array<{
    id: number;
    fileType: string | null;
    externalUrl: string | null;
  }>;
}

type DetailResponse =
  | { kind: "mail"; detail: MailDetail }
  | { kind: "chat"; conversationId: number; messages: ChatMessage[] };

// ── Helpers ───────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pl-PL");
}

function chatStatusLabel(status: number | string | undefined): string {
  // Chatwoot: 0=open, 1=resolved, 2=pending, 3=snoozed
  const map: Record<number, string> = {
    0: "Otwarty",
    1: "Rozwiązany",
    2: "Oczekuje",
    3: "Wyciszony",
  };
  if (typeof status === "number") return map[status] ?? `#${status}`;
  return String(status ?? "");
}

// ── Component ─────────────────────────────────────────────────────────────

export function CorrespondenceClient({
  userLabel,
  userEmail,
}: {
  userLabel?: string;
  userEmail?: string;
}) {
  const toast = useToast();

  const [accountsState, setAccountsState] = useState<{
    loading: boolean;
    data: AccountsResponse | null;
    error: string | null;
  }>({ loading: true, data: null, error: null });

  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const [threadsState, setThreadsState] = useState<{
    loading: boolean;
    data: MessagesResponse | null;
    error: string | null;
  }>({ loading: false, data: null, error: null });

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const [detailState, setDetailState] = useState<{
    loading: boolean;
    data: DetailResponse | null;
    error: string | null;
  }>({ loading: false, data: null, error: null });

  const loadAccounts = useCallback(async () => {
    setAccountsState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/admin/correspondence/accounts");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      setAccountsState({ loading: false, data: json.data, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Błąd pobierania skrzynek";
      setAccountsState({ loading: false, data: null, error: msg });
      toast.error("Błąd", msg);
    }
  }, [toast]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const loadThreads = useCallback(
    async (email: string) => {
      setThreadsState({ loading: true, data: null, error: null });
      setSelectedThreadId(null);
      setDetailState({ loading: false, data: null, error: null });
      try {
        const res = await fetch(
          `/api/admin/correspondence/messages?email=${encodeURIComponent(email)}`,
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        }
        setThreadsState({ loading: false, data: json.data, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Błąd ładowania wątków";
        setThreadsState({ loading: false, data: null, error: msg });
        toast.error("Błąd", msg);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!selectedEmail) return;
    void loadThreads(selectedEmail);
  }, [selectedEmail, loadThreads]);

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailState({ loading: true, data: null, error: null });
      try {
        const res = await fetch(
          `/api/admin/correspondence/message/${encodeURIComponent(id)}`,
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        }
        setDetailState({ loading: false, data: json.data, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Błąd ładowania wiadomości";
        setDetailState({ loading: false, data: null, error: msg });
        toast.error("Błąd", msg);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!selectedThreadId) return;
    void loadDetail(selectedThreadId);
  }, [selectedThreadId, loadDetail]);

  const accounts = accountsState.data?.accounts ?? [];
  const counters = accountsState.data?.counters ?? {};
  const configured = accountsState.data?.configured;

  const configWarnings = useMemo(() => {
    if (!configured) return [];
    const w: string[] = [];
    if (!configured.ovh) {
      w.push("OVH nie skonfigurowany — brak listy zweryfikowanych skrzynek.");
    }
    if (!configured.postal) {
      w.push("Postal API nie skonfigurowany — historia maili niedostępna.");
    }
    if (!configured.chatwoot) {
      w.push("Chatwoot DB nie skonfigurowany — brak czatów.");
    }
    return w;
  }, [configured]);

  const selectedAccount = accounts.find((a) => a.email === selectedEmail) ?? null;

  return (
    <PageShell
      maxWidth="2xl"
      header={
        <AppHeader
          userLabel={userLabel}
          userSubLabel={userEmail}
          backHref="/admin/config"
          title="Korespondencja e-mail"
        />
      }
    >
      <div className="space-y-4">
        <Card padding="lg">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Mail className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold mb-1">
                Korespondencja e-mail
              </h1>
              <p className="text-sm text-[var(--text-muted)] max-w-2xl">
                Cały ruch mailowy (Postal — wysyłka i odbiór) oraz konwersacje
                Chatwoot dla zweryfikowanych skrzynek z OVH.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAccounts()}
              className="text-sm flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)]/40"
              disabled={accountsState.loading}
            >
              <RefreshCw
                className={`w-4 h-4 ${accountsState.loading ? "animate-spin" : ""}`}
              />
              Odśwież
            </button>
          </div>
          {configWarnings.length > 0 && (
            <div className="mt-4 space-y-2">
              {configWarnings.map((w) => (
                <Alert key={w} tone="warning" icon={AlertTriangle}>
                  {w}
                </Alert>
              ))}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Lewa kolumna — skrzynki */}
          <Card padding="md" className="lg:col-span-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
              Skrzynki
            </div>
            {accountsState.loading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : accounts.length === 0 ? (
              <EmptyState
                compact
                icon={<Mail className="w-5 h-5" />}
                title="Brak skrzynek"
                description={
                  configured?.ovh
                    ? "Brak zweryfikowanych skrzynek w domenach OVH."
                    : "Skonfiguruj OVH w /admin/email."
                }
              />
            ) : (
              <ul className="space-y-1">
                {accounts.map((a) => {
                  const c = counters[a.email];
                  const active = a.email === selectedEmail;
                  return (
                    <li key={a.email}>
                      <button
                        type="button"
                        onClick={() => setSelectedEmail(a.email)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent)]/10"
                            : "border-transparent hover:bg-[var(--bg-card)]"
                        }`}
                      >
                        <div className="text-sm font-medium truncate">
                          {a.email}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {c ? `${c.mail}` : "—"}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {c ? `${c.chat}` : "—"}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Środek — lista wątków */}
          <Card padding="md" className="lg:col-span-4">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
              Wątki {selectedAccount ? `· ${selectedAccount.email}` : ""}
            </div>
            {!selectedEmail ? (
              <EmptyState
                compact
                icon={<Inbox className="w-5 h-5" />}
                title="Wybierz skrzynkę"
                description="Kliknij adres po lewej, aby zobaczyć wątki."
              />
            ) : threadsState.loading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : threadsState.error ? (
              <Alert tone="error">{threadsState.error}</Alert>
            ) : !threadsState.data || threadsState.data.items.length === 0 ? (
              <EmptyState
                compact
                icon={<Inbox className="w-5 h-5" />}
                title="Brak wątków"
                description="Brak wiadomości i czatów dla tego adresu."
              />
            ) : (
              <ul className="space-y-1 max-h-[70vh] overflow-y-auto">
                {threadsState.data.items.map((it) => {
                  const active = it.id === selectedThreadId;
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedThreadId(it.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent)]/10"
                            : "border-transparent hover:bg-[var(--bg-card)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {it.subject}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                              {it.kind === "mail"
                                ? it.direction === "outbound"
                                  ? `→ ${it.to}`
                                  : `← ${it.from}`
                                : `${it.messageCount ?? 0} wiadomości · ${chatStatusLabel(it.status)}`}
                            </div>
                          </div>
                          <Badge
                            tone={it.kind === "mail" ? "info" : "neutral"}
                          >
                            {it.kind === "mail" ? "Mail" : "Czat"}
                          </Badge>
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">
                          {formatTime(it.timestamp)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Prawa kolumna — detail */}
          <Card padding="md" className="lg:col-span-5">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
              Szczegóły
            </div>
            {!selectedThreadId ? (
              <EmptyState
                compact
                icon={<Mail className="w-5 h-5" />}
                title="Wybierz wątek"
                description="Kliknij wątek z listy, aby zobaczyć treść."
              />
            ) : detailState.loading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : detailState.error ? (
              <Alert tone="error">{detailState.error}</Alert>
            ) : detailState.data?.kind === "mail" ? (
              <MailDetailView detail={detailState.data.detail} />
            ) : detailState.data?.kind === "chat" ? (
              <ChatDetailView messages={detailState.data.messages} />
            ) : null}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

// ── Sub-views ─────────────────────────────────────────────────────────────

function MailDetailView({ detail }: { detail: MailDetail }) {
  const attachments: Attachment[] = detail.attachments
    .filter((a) => a.id)
    .map((a) => ({
      proxyId: `mail:${detail.id}:${a.id}`,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
    }));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-base font-semibold">{detail.subject || "(bez tematu)"}</div>
        <div className="text-xs text-[var(--text-muted)] space-y-0.5">
          <div>
            <span className="opacity-70">Od:</span> {detail.from}
          </div>
          <div>
            <span className="opacity-70">Do:</span> {detail.to}
          </div>
          <div>
            <span className="opacity-70">Status:</span> {detail.status} ·{" "}
            {detail.direction === "outbound" ? "wychodząca" : "przychodząca"}
          </div>
          <div>
            <span className="opacity-70">Czas:</span>{" "}
            {formatTime(detail.timestamp * 1000)}
          </div>
        </div>
      </div>
      <EmailHtmlPreview html={detail.htmlBody} textFallback={detail.textBody} />
      <AttachmentList attachments={attachments} />
    </div>
  );
}

function ChatDetailView({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return (
      <EmptyState
        compact
        icon={<MessageCircle className="w-5 h-5" />}
        title="Brak wiadomości"
        description="Konwersacja jest pusta."
      />
    );
  }
  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto">
      {messages.map((m) => {
        const incoming = m.messageType === 0;
        const activity = m.messageType === 2;
        const senderLabel = m.senderName ?? (incoming ? "Klient" : "System");
        return (
          <div
            key={m.id}
            className={`p-3 rounded-lg border ${
              activity
                ? "border-dashed border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)] text-xs"
                : incoming
                ? "border-[var(--border-subtle)] bg-[var(--bg-card)]"
                : "border-[var(--accent)]/30 bg-[var(--accent)]/5"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold">{senderLabel}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {formatTime(new Date(m.createdAt).getTime())}
              </span>
            </div>
            {m.content && (
              <div className="text-sm whitespace-pre-wrap break-words">
                {m.content}
              </div>
            )}
            {m.attachments.length > 0 && (
              <div className="mt-2">
                <AttachmentList
                  attachments={m.attachments
                    .filter((a) => a.externalUrl)
                    .map((a) => ({
                      proxyId: `chat:${a.id}`,
                      filename: a.fileType ?? `attachment-${a.id}`,
                      contentType: a.fileType ?? "application/octet-stream",
                      size: 0,
                    }))}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
