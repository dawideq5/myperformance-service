"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export function ActivityLog({ userId }: ActivityLogProps) {
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<"all" | "user" | "admin">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUserService.listEvents(userId, 100);
      setEvents(res.events);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać logów",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.kind === filter)),
    [events, filter],
  );

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
        <div>
          <h3 className="font-semibold text-sm text-[var(--text-main)]">
            Logi aktywności
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Ostatnie zdarzenia z rejestru Keycloak · user + admin events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-[var(--border-subtle)] overflow-hidden">
            {(["all", "user", "admin"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  filter === k
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-main)]"
                }`}
              >
                {k === "all" ? "Wszystkie" : k === "user" ? "User" : "Admin"}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void load()}
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

      {filtered.length === 0 && !loading ? (
        <div className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">
          Brak zdarzeń w tym filtrze.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)] max-h-[60vh] overflow-y-auto">
          {filtered.map((ev, idx) => {
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
                      <Badge tone={ev.kind === "admin" ? "info" : "neutral"}>
                        {ev.kind}
                      </Badge>
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
