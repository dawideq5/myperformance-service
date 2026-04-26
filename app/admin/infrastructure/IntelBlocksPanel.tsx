"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Clock,
  Globe,
  Loader2,
  Search,
  Server,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

interface IpIntel {
  ip: string;
  blocked: boolean;
  blockedAt: string | null;
  blockedExpires: string | null;
  blockedReason: string | null;
  blockedSource: string | null;
  blockedBy: string | null;

  events: {
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    firstSeen: string | null;
    lastSeen: string | null;
    distinctUsers: string[];
    distinctSources: string[];
  };

  devices: Array<{ deviceId: string; sightings: number; lastSeen: string }>;

  riskScore: number;
  riskBand: "low" | "medium" | "high" | "critical";
  riskReasons: string[];

  geo: {
    country: string | null;
    countryCode: string | null;
    city: string | null;
    asn: string | null;
    org: string | null;
  } | null;
}

const BAND_COLORS: Record<IpIntel["riskBand"], { bg: string; text: string; tone: "neutral" | "warning" | "danger" | "success" }> = {
  low: { bg: "bg-emerald-500/10", text: "text-emerald-400", tone: "success" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", tone: "warning" },
  high: { bg: "bg-orange-500/10", text: "text-orange-400", tone: "warning" },
  critical: { bg: "bg-red-500/10", text: "text-red-400", tone: "danger" },
};

const BAND_LABEL: Record<IpIntel["riskBand"], string> = {
  low: "Niskie",
  medium: "Średnie",
  high: "Wysokie",
  critical: "Krytyczne",
};

type Status = "all" | "blocked" | "active";

export function IntelBlocksPanel() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<Status>("blocked");
  const [data, setData] = useState<IpIntel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debounced) params.set("search", debounced);
      params.set("status", status);
      params.set("limit", "100");
      const r = await api.get<{ intel: IpIntel[] }>(
        `/api/admin/security/intel?${params.toString()}`,
      );
      setData(r.intel);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [debounced, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(ip: string) {
    if (!confirm(`Odblokować ${ip}?`)) return;
    setBusy(ip);
    try {
      await api.delete<{ ok: true }>(
        `/api/admin/security/blocks?ip=${encodeURIComponent(ip)}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unblock failed");
    } finally {
      setBusy(null);
    }
  }

  async function blockNow(ip: string, reason: string, durationMinutes?: number) {
    setBusy(ip);
    try {
      await api.post("/api/admin/security/blocks", {
        ip,
        reason,
        durationMinutes,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Block failed");
    } finally {
      setBusy(null);
    }
  }

  const stats = useMemo(() => {
    if (!data) return null;
    const total = data.length;
    const blocked = data.filter((d) => d.blocked).length;
    const critical = data.filter((d) => d.riskBand === "critical").length;
    const high = data.filter((d) => d.riskBand === "high").length;
    return { total, blocked, critical, high };
  }, [data]);

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex items-start gap-3">
          <Ban className="w-6 h-6 text-[var(--accent)] flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-base font-semibold">Threat intel — IP</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Korelacja blokad + zdarzeń bezpieczeństwa per IP. Risk score
              0-100 oparty o severity, liczbę kont docelowych, czas trwania
              ataku, godziny aktywności i geolokalizację.
            </p>
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label="IP w widoku" value={stats.total} icon={<Server className="w-4 h-4" />} />
          <KpiTile label="Aktywne blokady" value={stats.blocked} icon={<Ban className="w-4 h-4" />} tone="warning" />
          <KpiTile label="Krytyczne" value={stats.critical} icon={<AlertTriangle className="w-4 h-4" />} tone="danger" />
          <KpiTile label="Wysokie" value={stats.high} icon={<TrendingUp className="w-4 h-4" />} tone="warning" />
        </div>
      )}

      <Card padding="md">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              className="pl-9"
              placeholder="Szukaj: IP, user, powód blokady, kategoria…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            <option value="all">Wszystkie</option>
            <option value="blocked">Tylko zablokowane</option>
            <option value="active">Tylko wygasłe</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Ładuję intel…
        </div>
      ) : !data || data.length === 0 ? (
        <Card padding="md">
          <p className="text-xs text-[var(--text-muted)]">
            Brak wyników dla tego filtra.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <IntelCard
              key={d.ip}
              intel={d}
              busy={busy === d.ip}
              onUnblock={() => unblock(d.ip)}
              onBlock={(reason, dur) => blockNow(d.ip, reason, dur)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "neutral" | "danger" | "warning";
}) {
  const colorClass =
    tone === "danger"
      ? "text-red-400"
      : tone === "warning"
        ? "text-amber-400"
        : "";
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${colorClass}`}>
        {value}
      </div>
    </Card>
  );
}

function IntelCard({
  intel,
  busy,
  onUnblock,
  onBlock,
}: {
  intel: IpIntel;
  busy: boolean;
  onUnblock: () => void;
  onBlock: (reason: string, durationMinutes?: number) => void;
}) {
  const band = BAND_COLORS[intel.riskBand];
  const [expanded, setExpanded] = useState(false);
  const topCats = Object.entries(intel.events.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const sevTotal = Object.values(intel.events.bySeverity).reduce(
    (s, n) => s + n,
    0,
  );

  return (
    <Card
      padding="md"
      className={`border-l-4 ${
        intel.riskBand === "critical"
          ? "border-l-red-500"
          : intel.riskBand === "high"
            ? "border-l-orange-500"
            : intel.riskBand === "medium"
              ? "border-l-amber-500"
              : "border-l-emerald-500"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-semibold font-mono">{intel.ip}</code>
            <Badge tone={band.tone}>
              Risk {intel.riskScore} · {BAND_LABEL[intel.riskBand]}
            </Badge>
            {intel.blocked && <Badge tone="danger">ZABLOKOWANE</Badge>}
            {intel.geo?.countryCode && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <Globe className="w-3 h-3" />
                {intel.geo.country}
                {intel.geo.city ? ` · ${intel.geo.city}` : ""}
              </span>
            )}
          </div>
          {intel.geo?.org && (
            <div className="text-[10px] text-[var(--text-muted)] mt-1 font-mono truncate">
              {intel.geo.asn} {intel.geo.org}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-2">
          {intel.blocked ? (
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={onUnblock}
              leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
            >
              Odblokuj
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              onClick={() => onBlock(`Ręczna blokada (risk ${intel.riskScore})`, 1440)}
              leftIcon={<Ban className="w-3.5 h-3.5" />}
            >
              Zablokuj 24h
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-3 text-xs">
        <div>
          <div className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide">
            Zdarzenia
          </div>
          <div className="text-lg font-bold tabular-nums">{intel.events.total}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide flex items-center gap-1">
            <Users className="w-3 h-3" /> Konta
          </div>
          <div className="text-lg font-bold tabular-nums">
            {intel.events.distinctUsers.length}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pierwsze
          </div>
          <div className="text-xs tabular-nums">
            {intel.events.firstSeen
              ? new Date(intel.events.firstSeen).toLocaleString("pl-PL", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide flex items-center gap-1">
            <Clock className="w-3 h-3" /> Ostatnie
          </div>
          <div className="text-xs tabular-nums">
            {intel.events.lastSeen
              ? new Date(intel.events.lastSeen).toLocaleString("pl-PL", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>
        </div>
      </div>

      {sevTotal > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide mb-1">
            Severity breakdown
          </div>
          <div className="flex h-2 rounded overflow-hidden bg-[var(--bg-main)]">
            {(["critical", "high", "medium", "low", "info"] as const).map((s) => {
              const n = intel.events.bySeverity[s] ?? 0;
              if (n === 0) return null;
              const w = (n / sevTotal) * 100;
              const color = {
                critical: "#ef4444",
                high: "#f97316",
                medium: "#f59e0b",
                low: "#3b82f6",
                info: "#64748b",
              }[s];
              return (
                <div
                  key={s}
                  style={{ width: `${w}%`, background: color }}
                  title={`${s}: ${n}`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-1.5 text-[10px]">
            {(["critical", "high", "medium", "low", "info"] as const).map((s) => {
              const n = intel.events.bySeverity[s] ?? 0;
              return n > 0 ? (
                <span key={s} className="text-[var(--text-muted)]">
                  {s}: <strong>{n}</strong>
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {intel.riskReasons.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {intel.riskReasons.map((r, i) => (
            <Badge key={i} tone={band.tone}>
              {r}
            </Badge>
          ))}
        </div>
      )}

      {intel.blocked && (
        <div className="mt-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2">
          {intel.blockedReason}
          <div className="text-[10px] mt-0.5">
            Zablokowane{" "}
            {intel.blockedAt
              ? new Date(intel.blockedAt).toLocaleString("pl-PL")
              : "?"}{" "}
            przez {intel.blockedBy} ({intel.blockedSource})
            {intel.blockedExpires &&
              ` · wygasa ${new Date(intel.blockedExpires).toLocaleString("pl-PL")}`}
          </div>
        </div>
      )}

      <button
        type="button"
        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] mt-2"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Ukryj szczegóły ▴" : "Pokaż szczegóły (kategorie, użytkownicy, źródła) ▾"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-xs border-t border-[var(--border-subtle)] pt-3">
          {topCats.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide mb-1.5">
                Top kategorie
              </div>
              <div className="flex flex-wrap gap-1.5">
                {topCats.map(([cat, count]) => (
                  <Badge key={cat} tone="neutral">
                    {cat} · {count}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {intel.events.distinctUsers.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide mb-1.5 flex items-center gap-1">
                <Users className="w-3 h-3" />
                Atakowane konta ({intel.events.distinctUsers.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {intel.events.distinctUsers.slice(0, 20).map((u) => (
                  <code
                    key={u}
                    className="px-1.5 py-0.5 rounded bg-[var(--bg-main)] text-[10px]"
                  >
                    {u}
                  </code>
                ))}
                {intel.events.distinctUsers.length > 20 && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    … +{intel.events.distinctUsers.length - 20}
                  </span>
                )}
              </div>
            </div>
          )}
          {intel.events.distinctSources.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide mb-1.5">
                Źródła detekcji
              </div>
              <div className="flex flex-wrap gap-1.5">
                {intel.events.distinctSources.map((s) => (
                  <Badge key={s} tone="neutral">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {intel.devices.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide mb-1.5 flex items-center gap-1">
                <Server className="w-3 h-3" />
                Urządzenia widziane z tego IP ({intel.devices.length})
              </div>
              <ul className="space-y-1">
                {intel.devices.slice(0, 8).map((d) => (
                  <li
                    key={d.deviceId}
                    className="flex items-center justify-between gap-2"
                  >
                    <code className="font-mono text-[10px]">
                      {d.deviceId.slice(0, 8)}…{d.deviceId.slice(-4)}
                    </code>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {d.sightings}× ·{" "}
                      {new Date(d.lastSeen).toLocaleString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
