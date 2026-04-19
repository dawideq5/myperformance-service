"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Fingerprint,
  Key,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Unlink,
  UserCog,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Skeleton,
} from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

interface ActivityEntry {
  time: number;
  type: string;
  ip?: string;
  clientId?: string;
  error?: string;
  details?: Record<string, string>;
}

interface EventMeta {
  label: string;
  icon: LucideIcon;
  tone: "neutral" | "success" | "warning" | "error";
}

const EVENT_META: Record<string, EventMeta> = {
  LOGIN: { label: "Zalogowano", icon: LogIn, tone: "success" },
  LOGIN_ERROR: {
    label: "Nieudane logowanie",
    icon: ShieldAlert,
    tone: "error",
  },
  LOGOUT: { label: "Wylogowano", icon: LogOut, tone: "neutral" },
  LOGOUT_ERROR: {
    label: "Błąd wylogowania",
    icon: AlertTriangle,
    tone: "warning",
  },
  REGISTER: { label: "Utworzono konto", icon: UserPlus, tone: "success" },
  REGISTER_ERROR: {
    label: "Błąd rejestracji",
    icon: AlertTriangle,
    tone: "error",
  },
  UPDATE_PASSWORD: {
    label: "Zmieniono hasło",
    icon: KeyRound,
    tone: "success",
  },
  UPDATE_PASSWORD_ERROR: {
    label: "Błąd zmiany hasła",
    icon: AlertTriangle,
    tone: "error",
  },
  UPDATE_PROFILE: { label: "Zmieniono profil", icon: UserCog, tone: "neutral" },
  UPDATE_EMAIL: { label: "Zmieniono e-mail", icon: Mail, tone: "neutral" },
  VERIFY_EMAIL: { label: "Zweryfikowano e-mail", icon: Mail, tone: "success" },
  VERIFY_EMAIL_ERROR: {
    label: "Błąd weryfikacji e-mail",
    icon: AlertTriangle,
    tone: "error",
  },
  SEND_VERIFY_EMAIL: {
    label: "Wysłano e-mail weryfikacyjny",
    icon: Mail,
    tone: "neutral",
  },
  SEND_RESET_PASSWORD: {
    label: "Wysłano link resetu hasła",
    icon: Mail,
    tone: "neutral",
  },
  RESET_PASSWORD: {
    label: "Zresetowano hasło",
    icon: KeyRound,
    tone: "success",
  },
  RESET_PASSWORD_ERROR: {
    label: "Błąd resetu hasła",
    icon: AlertTriangle,
    tone: "error",
  },
  UPDATE_TOTP: {
    label: "Skonfigurowano aplikację 2FA",
    icon: Smartphone,
    tone: "success",
  },
  REMOVE_TOTP: {
    label: "Usunięto aplikację 2FA",
    icon: Smartphone,
    tone: "warning",
  },
  IDENTITY_PROVIDER_LINK_ACCOUNT: {
    label: "Podłączono konto zewnętrzne",
    icon: Link2,
    tone: "success",
  },
  IDENTITY_PROVIDER_FIRST_LOGIN: {
    label: "Pierwsze logowanie przez konto zewnętrzne",
    icon: Link2,
    tone: "success",
  },
  IDENTITY_PROVIDER_POST_LOGIN: {
    label: "Logowanie przez konto zewnętrzne",
    icon: Link2,
    tone: "success",
  },
  FEDERATED_IDENTITY_LINK: {
    label: "Podłączono konto zewnętrzne",
    icon: Link2,
    tone: "success",
  },
  REMOVE_FEDERATED_IDENTITY: {
    label: "Odłączono konto zewnętrzne",
    icon: Unlink,
    tone: "warning",
  },
  REFRESH_TOKEN: {
    label: "Odświeżono sesję",
    icon: RefreshCw,
    tone: "neutral",
  },
  CODE_TO_TOKEN: {
    label: "Wymiana kodu autoryzacji",
    icon: Shield,
    tone: "neutral",
  },
  INTROSPECT_TOKEN: {
    label: "Weryfikacja tokenu",
    icon: ShieldCheck,
    tone: "neutral",
  },
  USER_INFO_REQUEST: {
    label: "Pobrano informacje o użytkowniku",
    icon: ShieldCheck,
    tone: "neutral",
  },
  CLIENT_LOGIN: {
    label: "Logowanie klienta",
    icon: Shield,
    tone: "neutral",
  },
  GRANT_CONSENT: {
    label: "Udzielono zgody",
    icon: ShieldCheck,
    tone: "success",
  },
  REVOKE_GRANT: { label: "Cofnięto zgodę", icon: Unlink, tone: "warning" },
  WEBAUTHN_REGISTER: {
    label: "Zarejestrowano klucz bezpieczeństwa",
    icon: Key,
    tone: "success",
  },
  WEBAUTHN_REGISTER_ERROR: {
    label: "Błąd rejestracji klucza",
    icon: AlertTriangle,
    tone: "error",
  },
  REMOVE_CREDENTIAL: {
    label: "Usunięto metodę uwierzytelniania",
    icon: Fingerprint,
    tone: "warning",
  },
};

function resolveMeta(type: string): EventMeta {
  if (EVENT_META[type]) return EVENT_META[type];
  const normalized = type.replace(/_/g, " ").toLowerCase();
  return {
    label: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    icon: Shield,
    tone: "neutral",
  };
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

const TONE_STYLES: Record<EventMeta["tone"], string> = {
  neutral: "bg-[var(--bg-main)] text-[var(--text-muted)]",
  success: "bg-green-500/10 text-green-500",
  warning: "bg-yellow-500/10 text-yellow-500",
  error: "bg-red-500/10 text-red-500",
};

export function ActivityTab() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ entries: ActivityEntry[] }>(
        "/api/account/activity",
      );
      setEntries(data.entries ?? []);
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return;
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się pobrać logów aktywności",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const entry of entries) {
      const d = new Date(entry.time);
      const key = d.toLocaleDateString("pl-PL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <div className="space-y-6">
      <Card padding="md">
        <CardHeader
          icon={<Shield className="w-6 h-6 text-[var(--accent)]" aria-hidden="true" />}
          title="Logi aktywności"
          description="Zdarzenia z Twojego konta z ostatnich 7 dni"
          action={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
              onClick={() => void load()}
              loading={loading}
            >
              Odśwież
            </Button>
          }
        />
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && entries.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Shield
            className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-40"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--text-muted)]">
            Brak zdarzeń w ostatnich 7 dniach.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <section key={day}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 capitalize">
                {day}
              </h3>
              <div className="space-y-2">
                {items.map((entry, idx) => (
                  <ActivityRow key={`${entry.time}-${idx}`} entry={entry} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const meta = resolveMeta(entry.type);
  const Icon = meta.icon;
  const isError = Boolean(entry.error) || meta.tone === "error";

  return (
    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TONE_STYLES[meta.tone]}`}
      >
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[var(--text-main)]">
            {meta.label}
          </p>
          {isError && entry.error && (
            <Badge tone="neutral">
              <span className="text-red-500">{entry.error}</span>
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
          <span>{formatTime(entry.time)}</span>
          {entry.ip && <span>IP: {entry.ip}</span>}
          {entry.clientId && <span>Aplikacja: {entry.clientId}</span>}
        </div>
      </div>
    </div>
  );
}
