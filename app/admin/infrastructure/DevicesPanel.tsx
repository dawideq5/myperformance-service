"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Globe,
  Loader2,
  Monitor,
  Search,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import { Alert, Badge, Card, Input } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

interface DeviceOverviewRow {
  deviceId: string;
  sightings: number;
  distinctUsers: number;
  distinctIps: number;
  lastSeen: string;
  userAgent: string | null;
}
interface SuspiciousFinding {
  type: "shared_device" | "user_many_devices" | "device_many_ips";
  description: string;
  severity: "medium" | "high";
  evidence: Record<string, unknown>;
}
interface OverviewResp {
  devices: DeviceOverviewRow[];
  suspicious: SuspiciousFinding[];
}

interface DeviceIntel {
  deviceId: string;
  firstSeen: string;
  lastSeen: string;
  userAgent: string | null;
  totalSightings: number;
  distinctUsers: number;
  distinctIps: number;
  users: Array<{
    userId: string | null;
    email: string | null;
    count: number;
    lastSeen: string;
  }>;
  ips: Array<{ ip: string; count: number; lastSeen: string }>;
  riskFlags: string[];
}

function fmtUA(ua: string | null): { type: "desktop" | "mobile"; label: string } {
  if (!ua) return { type: "desktop", label: "—" };
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  let label = ua;
  const m = ua.match(/(Chrome|Firefox|Safari|Edge)\/(\d+)/);
  const os = ua.match(/(Windows|Macintosh|Linux|Android|iPhone OS)/);
  if (m && os) {
    label = `${m[1]} ${m[2]} · ${os[1]}`;
  } else {
    label = label.slice(0, 60);
  }
  return { type: isMobile ? "mobile" : "desktop", label };
}

export function DevicesPanel() {
  const [overview, setOverview] = useState<OverviewResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(168);
  const [selected, setSelected] = useState<string | null>(null);
  const [intel, setIntel] = useState<DeviceIntel | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<OverviewResp>(
        `/api/admin/security/devices?hours=${hours}`,
      );
      setOverview(r);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setIntel(null);
      return;
    }
    setIntelLoading(true);
    api
      .get<{ device: DeviceIntel | null }>(
        `/api/admin/security/devices?deviceId=${encodeURIComponent(selected)}`,
      )
      .then((r) => setIntel(r.device))
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : "Load failed"),
      )
      .finally(() => setIntelLoading(false));
  }, [selected]);

  const filtered = overview?.devices.filter((d) =>
    search
      ? d.deviceId.includes(search.toLowerCase()) ||
        (d.userAgent ?? "").toLowerCase().includes(search.toLowerCase())
      : true,
  );

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Monitor className="w-6 h-6 text-[var(--accent)] flex-shrink-0" />
            <div>
              <h3 className="text-base font-semibold">Urządzenia</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Persistent device fingerprinting (HMAC-signed cookie 1y, .myperformance.pl).
                Sighting per (device, user, ip) z dedupe 5 min. Korelacje
                shared device / user-on-many-devices.
              </p>
            </div>
          </div>
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={24}>24h</option>
            <option value={72}>3 dni</option>
            <option value={168}>7 dni</option>
            <option value={720}>30 dni</option>
          </select>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {overview?.suspicious && overview.suspicious.length > 0 && (
        <Card padding="md">
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Wzorce do uwagi
          </h4>
          <div className="space-y-1.5">
            {overview.suspicious.map((s, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-xs p-2 rounded border-l-2 ${
                  s.severity === "high"
                    ? "border-l-orange-500 bg-orange-500/5"
                    : "border-l-amber-500 bg-amber-500/5"
                }`}
              >
                <Badge tone={s.severity === "high" ? "danger" : "warning"}>
                  {s.type === "shared_device"
                    ? "Współdzielone"
                    : s.type === "user_many_devices"
                      ? "User wielo-urządz."
                      : "Many IPs"}
                </Badge>
                <span>{s.description}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding="md">
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              className="pl-9"
              placeholder="Szukaj: device id, user agent…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie…
          </div>
        ) : filtered && filtered.length > 0 ? (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {filtered.map((d) => {
              const ua = fmtUA(d.userAgent);
              const flag =
                d.distinctUsers >= 4
                  ? "amber"
                  : d.distinctIps >= 10
                    ? "amber"
                    : null;
              return (
                <li
                  key={d.deviceId}
                  className={`py-2 cursor-pointer hover:bg-[var(--bg-surface)] -mx-2 px-2 rounded ${selected === d.deviceId ? "bg-[var(--bg-surface)]" : ""}`}
                  onClick={() => setSelected(d.deviceId)}
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {ua.type === "mobile" ? (
                        <Smartphone className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                      ) : (
                        <Monitor className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                      )}
                      <code className="font-mono text-[10px] truncate" title={d.deviceId}>
                        {d.deviceId.slice(0, 8)}…{d.deviceId.slice(-4)}
                      </code>
                      <span className="truncate text-[var(--text-muted)]">
                        {ua.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-[var(--text-muted)]">
                      <span title="Sightings" className="tabular-nums">
                        {d.sightings}
                      </span>
                      <span
                        title="Distinct users"
                        className="flex items-center gap-1 tabular-nums"
                      >
                        <Users className="w-3 h-3" /> {d.distinctUsers}
                      </span>
                      <span
                        title="Distinct IPs"
                        className="flex items-center gap-1 tabular-nums"
                      >
                        <Globe className="w-3 h-3" /> {d.distinctIps}
                      </span>
                      {flag && (
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                      )}
                      <span className="text-[10px]">
                        {new Date(d.lastSeen).toLocaleString("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            Brak danych — przy następnym requeście użytkownicy dostaną
            cookie i pojawią się tutaj.
          </p>
        )}
      </Card>

      {selected && (
        <Card padding="md">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h4 className="text-sm font-semibold">
              Szczegóły urządzenia{" "}
              <code className="font-mono text-xs text-[var(--text-muted)] ml-2">
                {selected}
              </code>
            </h4>
            <button
              type="button"
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              onClick={() => setSelected(null)}
            >
              Zamknij ✕
            </button>
          </div>
          {intelLoading || !intel ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <div className="space-y-3 text-xs">
              {intel.riskFlags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {intel.riskFlags.map((f, i) => (
                    <Badge key={i} tone="warning">
                      {f}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Sightings" value={intel.totalSightings.toString()} />
                <Stat
                  label="Konta"
                  value={intel.distinctUsers.toString()}
                />
                <Stat label="IP" value={intel.distinctIps.toString()} />
                <Stat
                  label="Pierwsze widzenie"
                  value={new Date(intel.firstSeen).toLocaleDateString("pl-PL")}
                />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Konta na tym urządzeniu (
                  {intel.users.length})
                </div>
                <ul className="space-y-1">
                  {intel.users.map((u) => (
                    <li
                      key={u.userId ?? "_"}
                      className="flex items-center justify-between"
                    >
                      <code className="text-[11px]">
                        {u.email ?? u.userId ?? "anon"}
                      </code>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {u.count}× ·{" "}
                        {new Date(u.lastSeen).toLocaleString("pl-PL", {
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

              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
                  <Globe className="w-3 h-3" /> IP używane przez to urządzenie
                </div>
                <ul className="space-y-1">
                  {intel.ips.map((ip) => (
                    <li
                      key={ip.ip}
                      className="flex items-center justify-between"
                    >
                      <code className="text-[11px] font-mono">{ip.ip}</code>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {ip.count}× ·{" "}
                        {new Date(ip.lastSeen).toLocaleString("pl-PL", {
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

              <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 pt-2 border-t border-[var(--border-subtle)]">
                <Clock className="w-3 h-3" />
                Ostatnio: {new Date(intel.lastSeen).toLocaleString("pl-PL")}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
