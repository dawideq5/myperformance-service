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
  OnboardingCard,
  Skeleton,
} from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

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

// Keycloak error codes → human-readable Polish reason.
const ERROR_REASONS_PL: Record<string, string> = {
  invalid_user_credentials: "Niepoprawne dane logowania",
  user_not_found: "Nie znaleziono użytkownika",
  user_disabled: "Konto zablokowane",
  user_temporarily_disabled: "Konto tymczasowo zablokowane",
  account_disabled: "Konto wyłączone",
  email_not_verified: "E-mail nie został zweryfikowany",
  invalid_token: "Nieprawidłowy token",
  invalid_code: "Nieprawidłowy kod",
  invalid_request: "Nieprawidłowe żądanie",
  invalid_grant: "Nieprawidłowe odświeżenie sesji",
  invalid_client: "Nieprawidłowy klient",
  invalid_client_credentials: "Nieprawidłowe dane klienta",
  invalid_refresh_token: "Nieprawidłowy refresh token",
  expired_code: "Kod wygasł",
  expired_token: "Token wygasł",
  access_denied: "Odmowa dostępu",
  consent_denied: "Nie udzielono zgody",
  different_user_authenticated: "Zalogowany jest inny użytkownik",
  invalid_redirect_uri: "Nieprawidłowy adres powrotu",
  not_allowed: "Operacja niedozwolona",
  staleness_check_failed: "Sesja jest nieaktualna",
  identity_provider_error: "Błąd dostawcy tożsamości",
  identity_provider_login_failure: "Nieudane logowanie przez dostawcę",
  user_session_not_found: "Nie znaleziono sesji użytkownika",
  rejected_by_user: "Odrzucono przez użytkownika",
  federated_identity_not_found: "Brak powiązanego konta zewnętrznego",
  web_authn_not_supported: "WebAuthn nieobsługiwane",
  otp_not_configured: "Nie skonfigurowano 2FA",
  invalid_user_resource_owner_credentials: "Niepoprawne dane użytkownika",
};

function translateErrorCode(code: string): string {
  const normalized = code.trim().toLowerCase();
  if (ERROR_REASONS_PL[normalized]) return ERROR_REASONS_PL[normalized];
  return normalized.replace(/_/g, " ");
}

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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEKDAYS_PL = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];

interface DayChip {
  key: string;
  weekday: string;
  shortDate: string;
}

function buildLast7Days(today: Date): DayChip[] {
  const chips: DayChip[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    chips.push({
      key: dayKey(d),
      weekday: WEEKDAYS_PL[d.getDay()],
      shortDate: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`,
    });
  }
  return chips;
}

const TONE_STYLES: Record<EventMeta["tone"], string> = {
  neutral: "bg-[var(--bg-main)] text-[var(--text-muted)]",
  success: "bg-green-500/10 text-green-500",
  warning: "bg-yellow-500/10 text-yellow-500",
  error: "bg-red-500/10 text-red-500",
};

const PAGE_SIZE = 50;

export function ActivityTab() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sectionLimits, setSectionLimits] = useState<Record<string, number>>(
    {},
  );

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

  const dayChips = useMemo(() => buildLast7Days(new Date()), []);

  const visibleEntries = useMemo(() => {
    if (!selectedDay) return entries;
    return entries.filter((e) => dayKey(new Date(e.time)) === selectedDay);
  }, [entries, selectedDay]);

  // Group by yyyy-mm-dd so sections line up with the chip filter.
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const entry of visibleEntries) {
      const key = dayKey(new Date(entry.time));
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [visibleEntries]);

  const formatSectionTitle = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const entryCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      const key = dayKey(new Date(entry.time));
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  return (
    <div className="space-y-6">
      <OnboardingCard
        storageKey="account-activity"
        title="Audit-trail Twojego konta"
      >
        Każde logowanie, zmiana hasła, dodanie 2FA, połączenie integracji,
        sesja SSO — wszystko trafia tu na 7 dni. Filtry per dzień + per typ.
        Anomalia? Wciśnij „Wyloguj wszystko" w sekcji Sesje i zmień hasło.
      </OnboardingCard>
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              selectedDay === null
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-main)]",
            )}
          >
            Wszystkie
          </button>
          {dayChips.map((chip) => {
            const active = selectedDay === chip.key;
            const count = entryCountByDay[chip.key] ?? 0;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() =>
                  setSelectedDay((current) =>
                    current === chip.key ? null : chip.key,
                  )
                }
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-2",
                  active
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-main)]",
                )}
                aria-pressed={active}
              >
                <span className="font-semibold">{chip.weekday}</span>
                <span className="opacity-80">{chip.shortDate}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] px-1",
                      active
                        ? "bg-white/20"
                        : "bg-[var(--bg-main)] text-[var(--text-muted)]",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && entries.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : visibleEntries.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Shield
            className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-40"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--text-muted)]">
            {selectedDay
              ? "Brak zdarzeń tego dnia."
              : "Brak zdarzeń w ostatnich 7 dniach."}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, items]) => {
            const limit = sectionLimits[key] ?? PAGE_SIZE;
            const shown = items.slice(0, limit);
            const remaining = items.length - shown.length;
            return (
              <section key={key}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 capitalize">
                  {formatSectionTitle(key)}{" "}
                  <span className="text-[var(--text-muted)]/70 normal-case">
                    ({items.length})
                  </span>
                </h3>
                <div className="space-y-2">
                  {shown.map((entry, idx) => (
                    <ActivityRow key={`${entry.time}-${idx}`} entry={entry} />
                  ))}
                </div>
                {remaining > 0 && (
                  <div className="mt-3 text-center">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setSectionLimits((prev) => ({
                          ...prev,
                          [key]: (prev[key] ?? PAGE_SIZE) + PAGE_SIZE,
                        }))
                      }
                    >
                      Pokaż więcej ({remaining})
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const meta = resolveMeta(entry.type);
  const Icon = meta.icon;
  const reason = entry.error ? translateErrorCode(entry.error) : null;

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
          {reason && (
            <Badge tone="neutral">
              <span className="text-red-500">Powód: {reason}</span>
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
