"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Pencil,
  RefreshCw,
  Shield,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { Alert, Badge, Button, Card } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import { adminUserService } from "@/app/account/account-service";

interface ActivityLogProps {
  userId: string;
  /** Auto-refresh co X ms. Gdy 0 lub undefined — bez pollingu. */
  pollMs?: number;
}

type UserEvent = {
  kind: "user" | "admin";
  type: string;
  time: number | null;
  clientId: string | null;
  ipAddress: string | null;
  error: string | null;
  details: Record<string, unknown>;
};

function dedupeEvents(events: UserEvent[]): UserEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.time}-${e.type}-${e.kind}-${JSON.stringify(e.details)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function iconFor(type: string): LucideIcon {
  const t = type.toLowerCase();
  if (t.includes("login")) return LogIn;
  if (t.includes("logout")) return LogOut;
  if (t.includes("password") || t.includes("update_credential")) return KeyRound;
  if (t.includes("email") || t.includes("verify")) return Mail;
  if (t.includes("update_profile") || t.includes("update_user")) return UserCog;
  if (t.includes("role") || t.includes("grant")) return Shield;
  if (t.includes("update")) return Pencil;
  return Activity;
}

function labelFor(ev: UserEvent): string {
  const type = ev.type;
  const map: Record<string, string> = {
    LOGIN: "Logowanie",
    LOGIN_ERROR: "Nieudane logowanie",
    LOGOUT: "Wylogowanie",
    TOKEN_REFRESH: "Odświeżenie tokenu",
    CODE_TO_TOKEN: "Wymiana code→token",
    UPDATE_PROFILE: "Aktualizacja profilu",
    UPDATE_EMAIL: "Zmiana emaila",
    UPDATE_PASSWORD: "Zmiana hasła",
    UPDATE_TOTP: "Zmiana TOTP",
    REMOVE_TOTP: "Usunięcie TOTP",
    SEND_VERIFY_EMAIL: "Wysłano email weryfikacyjny",
    SEND_RESET_PASSWORD: "Wysłano link resetu hasła",
    VERIFY_EMAIL: "Weryfikacja emaila",
    REGISTER: "Rejestracja konta",
    REMOVE_CREDENTIAL: "Usunięcie credentiala (klucz/TOTP)",
    UPDATE_CREDENTIAL: "Aktualizacja credentiala",
    FEDERATED_IDENTITY_LINK: "Powiązanie konta zewnętrznego",
    FEDERATED_IDENTITY_UNLINK: "Odłączenie konta zewnętrznego",
    GRANT_CONSENT: "Zgoda na dostęp clienta",
    REVOKE_GRANT: "Odwołanie zgody clienta",
    CLIENT_LOGIN: "Login przez clienta",
  };
  return map[type] ?? type.replaceAll("_", " ").toLowerCase();
}

function formatTime(t: number | null): string {
  if (!t) return "—";
  return new Date(t).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ActivityLog({ userId, pollMs = 5000 }: ActivityLogProps) {
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [live, setLive] = useState(true);
  const prevCountRef = useRef(0);
  const [newCount, setNewCount] = useState(0);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError(null);
      try {
        const res = await adminUserService.listEvents(userId, 100);
        const deduped = dedupeEvents(res.events);
        if (background && deduped.length > prevCountRef.current) {
          setNewCount(deduped.length - prevCountRef.current);
          setTimeout(() => setNewCount(0), 3000);
        }
        prevCountRef.current = deduped.length;
        setEvents(deduped);
      } catch (err) {
        if (!background) {
          setError(
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się pobrać logów",
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

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <Card padding="none">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-[var(--text-main)]">
            Logi aktywności
          </h3>
          {newCount > 0 && (
            <Badge tone="info">+{newCount} nowych</Badge>
          )}
          {live && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void load(false)}
            loading={loading}
            leftIcon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
          >
            Odśwież
          </Button>
        </div>
      </header>

      {error && (
        <div className="px-4 pt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {events.length === 0 && !loading ? (
        <div className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">
          Brak zdarzeń — aktywność pojawi się tu automatycznie.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)] max-h-[60vh] overflow-y-auto">
          {events.map((ev, idx) => {
            const Icon = iconFor(ev.type);
            const isExpanded = expanded.has(idx);
            const hasDetails = Object.keys(ev.details).length > 0;
            const isError = !!ev.error || ev.type.toUpperCase().includes("ERROR");
            return (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => hasDetails && toggleExpand(idx)}
                  className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg-main)] transition-colors"
                  disabled={!hasDetails}
                >
                  <span
                    className={`flex-shrink-0 w-7 h-7 rounded-md border flex items-center justify-center mt-0.5 ${
                      isError
                        ? "border-red-500/30 bg-red-500/10"
                        : "border-[var(--border-subtle)] bg-[var(--bg-main)]"
                    }`}
                  >
                    {isError ? (
                      <AlertTriangle
                        className="w-3.5 h-3.5 text-red-500"
                        aria-hidden="true"
                      />
                    ) : (
                      <Icon
                        className="w-3.5 h-3.5 text-[var(--accent)]"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm text-[var(--text-main)]">
                        {labelFor(ev)}
                      </span>
                      {ev.clientId && (
                        <span className="font-mono text-[10px] text-[var(--text-muted)] bg-[var(--bg-main)] px-1.5 py-0.5 rounded">
                          {ev.clientId}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {formatTime(ev.time)}
                      {ev.ipAddress && <> · IP {ev.ipAddress}</>}
                      {ev.error && (
                        <span className="text-red-400"> · {ev.error}</span>
                      )}
                    </div>
                    {isExpanded && hasDetails && (
                      <pre className="mt-2 text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded p-2 overflow-x-auto">
                        {JSON.stringify(ev.details, null, 2)}
                      </pre>
                    )}
                  </div>
                  {hasDetails && (
                    <ChevronDown
                      className={`w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-1 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
