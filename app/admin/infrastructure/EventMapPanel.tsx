"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Globe,
  Loader2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Alert, Badge, Card, CardHeader } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

interface CountryAgg {
  countryCode: string;
  country: string;
  events: number;
  highSeverity: number;
  uniqueIps: number;
  uniqueUsers: number;
}
interface MarkerPoint {
  ip: string;
  lat: number;
  lng: number;
  country: string | null;
  city: string | null;
  events: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
}
interface TimelineBucket {
  hour: string;
  total: number;
  bySeverity: Record<string, number>;
}
interface Correlation {
  type: "credential_stuffing" | "compromised_account" | "distributed_attack";
  description: string;
  severity: "medium" | "high" | "critical";
  evidence: Record<string, unknown>;
}
interface MapData {
  windowHours: number;
  summary: {
    totalEvents: number;
    highSeverityEvents: number;
    uniqueIps: number;
    countries: number;
  };
  countries: CountryAgg[];
  markers: MarkerPoint[];
  timeline: TimelineBucket[];
  correlations: Correlation[];
}

const SEVERITY_COLOR: Record<MarkerPoint["severity"], string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#3b82f6",
  info: "#64748b",
};

export function EventMapPanel() {
  const [hours, setHours] = useState(168);
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<MapData>(
        `/api/admin/security/map?hours=${hours}`,
      );
      setData(r);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardHeader
            icon={<Globe className="w-6 h-6 text-[var(--accent)]" />}
            title="Mapa zdarzeń bezpieczeństwa"
            description="Analiza geograficzna + timeline + automatyczne wykrywanie wzorców (credential stuffing, compromised accounts)."
          />
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={24}>24h</option>
            <option value={72}>3 dni</option>
            <option value={168}>7 dni</option>
            <option value={336}>14 dni</option>
            <option value={720}>30 dni</option>
          </select>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {loading || !data ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Analizuję dane…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat
              label="Zdarzenia"
              value={data.summary.totalEvents.toLocaleString("pl-PL")}
            />
            <Stat
              label="High/Critical"
              value={data.summary.highSeverityEvents.toLocaleString("pl-PL")}
              tone="danger"
            />
            <Stat label="Unikalne IP" value={data.summary.uniqueIps.toString()} />
            <Stat
              label="Krajów"
              value={data.summary.countries.toString()}
            />
          </div>

          {data.correlations.length > 0 && (
            <Card padding="md">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Wzorce ataków (auto-detect)
              </h4>
              <div className="space-y-1.5">
                {data.correlations.map((c, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 text-xs p-2 rounded border-l-2 ${
                      c.severity === "critical"
                        ? "border-l-red-500 bg-red-500/5"
                        : c.severity === "high"
                          ? "border-l-orange-500 bg-orange-500/5"
                          : "border-l-amber-500 bg-amber-500/5"
                    }`}
                  >
                    <Badge
                      tone={
                        c.severity === "critical"
                          ? "danger"
                          : c.severity === "high"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {c.type === "credential_stuffing"
                        ? "Credential stuffing"
                        : c.type === "compromised_account"
                          ? "Compromised account"
                          : "Distributed"}
                    </Badge>
                    <span>{c.description}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card padding="md">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Mapa świata
              </h4>
              <WorldMap markers={data.markers} />
            </Card>

            <Card padding="md">
              <h4 className="text-sm font-semibold mb-3">
                Top kraje pochodzenia ataków
              </h4>
              <CountryList countries={data.countries.slice(0, 12)} />
            </Card>
          </div>

          <Card padding="md">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Timeline zdarzeń (ostatnie {hours}h)
            </h4>
            <Timeline buckets={data.timeline} />
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <Card padding="md">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className={`text-2xl font-bold tabular-nums ${tone === "danger" ? "text-red-400" : ""}`}
      >
        {value}
      </div>
    </Card>
  );
}

function CountryList({ countries }: { countries: CountryAgg[] }) {
  if (countries.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">Brak danych geo.</p>;
  }
  const max = Math.max(...countries.map((c) => c.events));
  return (
    <ul className="space-y-1.5">
      {countries.map((c) => (
        <li key={c.countryCode} className="text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-2">
              <span className="font-mono text-[var(--text-muted)] w-6">
                {c.countryCode}
              </span>
              <span className="font-medium">{c.country}</span>
            </span>
            <span className="font-mono tabular-nums text-[var(--text-muted)]">
              {c.events} · {c.uniqueIps} IP
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--bg-main)] overflow-hidden flex">
            <div
              className="h-full bg-red-500"
              style={{ width: `${(c.highSeverity / max) * 100}%` }}
              title={`High/Critical: ${c.highSeverity}`}
            />
            <div
              className="h-full bg-amber-500"
              style={{
                width: `${((c.events - c.highSeverity) / max) * 100}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Mała mapa świata: punkty na latitude/longitude przeliczane na SVG.
 * Equirectangular projection (lng → x, lat → y) — wystarczy do pokazania
 * skupisk geograficznych. Ramka pokazuje kontynenty schematycznie.
 */
function WorldMap({ markers }: { markers: MarkerPoint[] }) {
  const W = 360;
  const H = 180;
  const project = (lat: number, lng: number) => {
    const x = ((lng + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return { x, y };
  };
  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto rounded bg-[var(--bg-main)]"
        role="img"
        aria-label="Rozmieszczenie geograficzne IP"
      >
        {/* uproszczone kontynenty jako prostokąty */}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="var(--bg-main)"
        />
        {/* kratka */}
        {[60, 120, 180, 240, 300].map((x) => (
          <line
            key={x}
            x1={x}
            y1={0}
            x2={x}
            y2={H}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={0.5}
          />
        ))}
        {[45, 90, 135].map((y) => (
          <line
            key={y}
            x1={0}
            y1={y}
            x2={W}
            y2={y}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={0.5}
          />
        ))}
        {/* equator */}
        <line
          x1={0}
          y1={H / 2}
          x2={W}
          y2={H / 2}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
        {/* markers */}
        {markers.map((m) => {
          const { x, y } = project(m.lat, m.lng);
          const r = Math.min(6, 2 + Math.log10(m.events + 1) * 1.5);
          return (
            <g key={m.ip}>
              <circle
                cx={x}
                cy={y}
                r={r * 1.6}
                fill={SEVERITY_COLOR[m.severity]}
                opacity={0.2}
              />
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={SEVERITY_COLOR[m.severity]}
                opacity={0.85}
              >
                <title>
                  {m.ip} · {m.city ?? m.country ?? "?"} · {m.events} zdarzeń · {m.severity}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-[var(--text-muted)]">
        {(["critical", "high", "medium", "low", "info"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: SEVERITY_COLOR[s] }}
            />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function Timeline({ buckets }: { buckets: TimelineBucket[] }) {
  if (buckets.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">Brak danych.</p>;
  }
  const max = Math.max(...buckets.map((b) => b.total));
  // Limit wyświetlanych bucketów (responsive)
  const step = Math.max(1, Math.floor(buckets.length / 60));
  const sampled: TimelineBucket[] = [];
  for (let i = 0; i < buckets.length; i += step) {
    const slice = buckets.slice(i, i + step);
    const total = slice.reduce((s, x) => s + x.total, 0);
    const bySeverity: Record<string, number> = {};
    for (const x of slice) {
      for (const [k, v] of Object.entries(x.bySeverity)) {
        bySeverity[k] = (bySeverity[k] ?? 0) + v;
      }
    }
    sampled.push({
      hour: slice[0]!.hour,
      total,
      bySeverity,
    });
  }
  return (
    <div>
      <div className="flex items-end gap-0.5 h-32">
        {sampled.map((b) => {
          const h = max > 0 ? (b.total / max) * 100 : 0;
          const segs: Array<{ sev: string; pct: number; color: string }> = [];
          let acc = 0;
          for (const sev of ["critical", "high", "medium", "low", "info"]) {
            const n = b.bySeverity[sev] ?? 0;
            if (n > 0 && b.total > 0) {
              segs.push({
                sev,
                pct: (n / b.total) * 100,
                color: SEVERITY_COLOR[sev as keyof typeof SEVERITY_COLOR],
              });
              acc += n;
            }
          }
          return (
            <div
              key={b.hour}
              className="flex-1 flex flex-col-reverse"
              style={{ height: `${Math.max(2, h)}%` }}
              title={`${new Date(b.hour).toLocaleString("pl-PL")} · ${b.total} zdarzeń`}
            >
              {segs.map((s) => (
                <div
                  key={s.sev}
                  style={{
                    height: `${s.pct}%`,
                    background: s.color,
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
        <span>
          {sampled[0]
            ? new Date(sampled[0].hour).toLocaleString("pl-PL", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
              })
            : ""}
        </span>
        <span>
          {sampled[sampled.length - 1]
            ? new Date(sampled[sampled.length - 1]!.hour).toLocaleString(
                "pl-PL",
                { day: "2-digit", month: "2-digit", hour: "2-digit" },
              )
            : ""}
        </span>
      </div>
    </div>
  );
}
