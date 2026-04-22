"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, Monitor, X } from "lucide-react";

import { Alert, Badge, Button, Card } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminUserService,
  type AdminUserSession,
} from "@/app/account/account-service";

interface SessionsCardProps {
  userId: string;
  pollMs?: number;
  onAllTerminated?: () => void;
}

function formatRelative(ts: number): string {
  if (!ts) return "—";
  const ms = ts > 100000000000 ? ts : ts * 1000;
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "przed chwilą";
  if (sec < 60) return `${sec} s temu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min temu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} godz. temu`;
  return new Date(ms).toLocaleString("pl-PL");
}

function formatStarted(ts: number): string {
  const ms = ts > 100000000000 ? ts : ts * 1000;
  return new Date(ms).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionsCard({
  userId,
  pollMs = 5000,
  onAllTerminated,
}: SessionsCardProps) {
  const [sessions, setSessions] = useState<AdminUserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [killing, setKilling] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [_, setTick] = useState(0);
  const prevCountRef = useRef(0);
  const [changeHint, setChangeHint] = useState<string | null>(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError(null);
      try {
        const res = await adminUserService.sessions(userId);
        const prev = prevCountRef.current;
        prevCountRef.current = res.sessions.length;
        if (background) {
          if (res.sessions.length > prev) {
            setChangeHint(`Nowa sesja (${res.sessions.length - prev})`);
            setTimeout(() => setChangeHint(null), 3000);
          } else if (res.sessions.length < prev) {
            setChangeHint(`Sesja zamknięta (${prev - res.sessions.length})`);
            setTimeout(() => setChangeHint(null), 3000);
          }
        }
        setSessions(res.sessions);
      } catch (err) {
        if (!background) {
          setError(
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się pobrać sesji",
          );
        }
      } finally {
        if (!background) setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!live || !pollMs) return;
    const t = setInterval(() => {
      if (!document.hidden) void load(true);
    }, pollMs);
    return () => clearInterval(t);
  }, [live, pollMs, load]);

  // Tik „relative time" żeby „X s temu" aktualizowało się bez re-fetch.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const killOne = useCallback(
    async (_sessionId: string) => {
      // KC admin API nie ma endpointu do zabijania pojedynczej sesji usera
      // (/sessions/{id} wymaga admin-events pluginu). W praktyce: odłączamy
      // jedną-sesję przez execute actions email → LOGOUT_ALL_SESSIONS (KC v26),
      // ale szybciej: zabić wszystkie i user się po prostu zaloguje ponownie
      // na tym urządzeniu które jest używane. Frontend eksponuje tylko "X"
      // który wywołuje logoutAll.
      if (
        !window.confirm(
          "Keycloak nie udostępnia endpointu do zabijania pojedynczej sesji — zamknie wszystkie jednocześnie. Kontynuować?",
        )
      )
        return;
      await killAll();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const killAll = useCallback(async () => {
    setKilling("all");
    setError(null);
    try {
      await adminUserService.logoutAll(userId);
      setSessions([]);
      prevCountRef.current = 0;
      onAllTerminated?.();
      setChangeHint("Wszystkie sesje zakończone");
      setTimeout(() => setChangeHint(null), 3000);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zakończyć sesji",
      );
    } finally {
      setKilling(null);
    }
  }, [userId, onAllTerminated]);

  return (
    <Card padding="none">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
          <h3 className="font-semibold text-sm text-[var(--text-main)]">
            Aktywne sesje
          </h3>
          <Badge tone="neutral">{sessions.length}</Badge>
          {live && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              live
            </span>
          )}
          {changeHint && (
            <span className="text-xs text-[var(--accent)] animate-pulse">
              {changeHint}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            {live ? "Pauza" : "Live"}
          </button>
          {sessions.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void killAll()}
              loading={killing === "all"}
              disabled={!!killing}
              leftIcon={<LogOut className="w-4 h-4" aria-hidden="true" />}
              className="text-red-500 hover:text-red-600"
            >
              Zakończ wszystkie
            </Button>
          )}
        </div>
      </header>

      {error && (
        <div className="px-4 pt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {loading && sessions.length === 0 ? (
        <div className="px-4 py-6 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Ładowanie sesji…
        </div>
      ) : sessions.length === 0 ? (
        <div className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">
          Brak aktywnych sesji.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {sessions.map((s) => {
            const clients = s.clients ? Object.values(s.clients) : [];
            return (
              <li key={s.id} className="px-4 py-3 flex items-start gap-3">
                <Monitor
                  className="w-4 h-4 text-[var(--text-muted)] mt-1 flex-shrink-0"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[var(--text-main)]">
                      {s.ipAddress || "—"}
                    </span>
                    {clients.length > 0 && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {clients.slice(0, 3).join(", ")}
                        {clients.length > 3 && ` +${clients.length - 3}`}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    od {formatStarted(s.started)} · ostatnia aktywność{" "}
                    {formatRelative(s.lastAccess)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void killOne(s.id)}
                  disabled={!!killing}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-[var(--bg-main)] text-red-500 hover:text-red-600 transition-colors"
                  title="Zakończ sesję"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
