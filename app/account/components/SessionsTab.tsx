"use client";

import { useCallback } from "react";
import { Clock, Globe, LogOut } from "lucide-react";

import { Badge, Button, Card } from "@/components/ui";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { useAsyncAction } from "@/hooks/useAsyncAction";

import { useAccount } from "../AccountProvider";
import { accountService } from "../account-service";
import type { KeycloakSession } from "../types";

function normalizeSeconds(value: number): number {
  return value > 10_000_000_000 ? Math.floor(value / 1000) : value;
}

function formatDate(timestampSec: number): string {
  if (!timestampSec || timestampSec < 1_000_000) return "—";
  const ms = timestampSec > 1e12 ? timestampSec : timestampSec * 1000;
  return new Date(ms).toLocaleString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSessionProgress(startedSec: number, expiresSec: number): number {
  const now = Math.floor(Date.now() / 1000);
  const total = expiresSec - startedSec;
  if (total <= 0) return 0;
  const elapsed = now - startedSec;
  return Math.max(0, Math.min(100, ((total - elapsed) / total) * 100));
}

function formatTimeRemaining(expiresSec: number): string {
  if (!expiresSec) return "N/A";
  const real = normalizeSeconds(expiresSec);
  const now = Math.floor(Date.now() / 1000);
  const remaining = real - now;
  if (remaining <= 0) return "Wygasła";
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  if (hours > 100_000) return "Bez limitu";
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

function SessionItem({
  session,
  onLogout,
  pending,
}: {
  session: KeycloakSession;
  onLogout: (id: string) => void;
  pending: boolean;
}) {
  const progress = getSessionProgress(session.started, session.expires);
  const remaining = formatTimeRemaining(session.expires);
  const progressColor =
    progress > 50 ? "bg-green-500" : progress > 20 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div
      className={`p-4 rounded-xl border ${
        session.current
          ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
          : "border-[var(--border-subtle)] bg-[var(--bg-main)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-[var(--bg-card)] flex items-center justify-center flex-shrink-0 mt-0.5">
            <Globe
              className="w-5 h-5 text-[var(--text-muted)]"
              aria-hidden="true"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-[var(--text-main)]">
                {session.browser || "Przeglądarka"}
              </p>
              {session.current && <Badge tone="accent">Aktualna</Badge>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                Rozpoczęta: {formatDate(session.started)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                Wygasa: {formatDate(session.expires)}
              </span>
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                IP: {session.ipAddress}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                Ostatnia aktywność: {formatDate(session.lastAccess)}
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                <span>Pozostało: {remaining}</span>
                <span aria-hidden="true">{Math.round(progress)}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
                aria-label={`Pozostały czas sesji: ${remaining}`}
                className="w-full h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-all ${progressColor}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        {!session.current && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Wyloguj sesję"
            loading={pending}
            onClick={() => onLogout(session.id)}
            className="text-red-500 hover:bg-red-500/10 hover:text-red-500"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function SessionsTab() {
  const { sessions, removeSessionLocally, refetchSessions } = useAccount();
  const { fullLogout } = useAuthRedirect();

  const logoutAction = useAsyncAction(async (sessionId: string) => {
    await accountService.deleteSession(sessionId);
    return sessionId;
  });

  const handleLogout = useCallback(
    async (sessionId: string) => {
      const isCurrent = sessions.find((s) => s.id === sessionId)?.current;
      const result = await logoutAction.run(sessionId);
      if (!result) {
        await refetchSessions();
        return;
      }
      if (isCurrent) {
        await fullLogout();
        return;
      }
      removeSessionLocally(sessionId);
    },
    [sessions, logoutAction, fullLogout, removeSessionLocally, refetchSessions],
  );

  return (
    <div className="space-y-6">
      <Card padding="md">
        <h2 className="text-lg font-semibold text-[var(--text-main)] mb-6">
          Aktywne sesje
        </h2>
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <p className="text-center text-[var(--text-muted)] py-8">
              Brak aktywnych sesji
            </p>
          ) : (
            sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                onLogout={handleLogout}
                pending={logoutAction.pending}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
