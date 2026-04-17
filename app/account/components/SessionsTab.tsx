"use client";

import { Globe, Clock, LogOut } from "lucide-react";
import type { KeycloakSession } from "@/app/account/types";

function formatDate(timestampSec: number): string {
  if (!timestampSec || timestampSec < 1_000_000) return "—";
  const ms = timestampSec > 1e12 ? timestampSec : timestampSec * 1000;
  return new Date(ms).toLocaleString("pl-PL", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
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
  const now = Math.floor(Date.now() / 1000);
  const remaining = expiresSec - now;
  if (remaining <= 0) return "Wygasła";
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

interface Props {
  sessions: KeycloakSession[];
  onLogoutSession: (id: string) => void;
}

export function SessionsTab({ sessions, onLogoutSession }: Props) {
  return (
    <div className="space-y-6 animate-tab-in">
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-[var(--text-main)] mb-6">Aktywne sesje</h2>
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <p className="text-center text-[var(--text-muted)] py-8">Brak aktywnych sesji</p>
          ) : (
            sessions.map((s) => {
              const progress = getSessionProgress(s.started, s.expires);
              const remaining = formatTimeRemaining(s.expires);
              return (
                <div
                  key={s.id}
                  className={`p-4 rounded-xl border ${s.current ? "border-[var(--accent)]/30 bg-[var(--accent)]/5" : "border-[var(--border-subtle)] bg-[var(--bg-main)]"}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-[var(--bg-card)] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Globe className="w-5 h-5 text-[var(--text-muted)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-main)]">
                          {s.browser || "Przeglądarka"}
                          {s.current && (
                            <span className="ml-2 text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded-full">
                              Aktualna
                            </span>
                          )}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 text-xs text-[var(--text-muted)]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            Rozpoczęta: {formatDate(s.started)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            Wygasa: {formatDate(s.expires)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3 flex-shrink-0" />
                            IP: {s.ipAddress}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            Ostatnia aktywność: {formatDate(s.lastAccess)}
                          </span>
                        </div>
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                            <span>Pozostało: {remaining}</span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${progress > 50 ? "bg-green-500" : progress > 20 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    {!s.current && (
                      <button
                        onClick={() => onLogoutSession(s.id)}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0 ml-2"
                        title="Wyloguj sesję"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
