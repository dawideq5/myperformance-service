"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Globe, Loader2, TrendingUp, Zap } from "lucide-react";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  OnboardingCard,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";
import { SEVERITY_HEX } from "@/lib/ui/severity";

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

const SEVERITY_COLOR = SEVERITY_HEX;

const LeafletMap = dynamic(() => import("./LeafletMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] rounded-lg bg-[var(--bg-main)] text-xs text-[var(--text-muted)]">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Ładowanie mapy…
    </div>
  ),
});

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
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
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

      <OnboardingCard storageKey="event-map" title="Jak czytać mapę">
        Markery to publiczne IP z <code>mp_security_events</code> w okresie.
        Kolor = max severity (czerwony = critical), rozmiar ∝ log(events).
        Sekcja <strong>Wzorce ataków</strong> auto-wykrywa: 1 IP × 3+
        kont (credential stuffing), 1 user × 3+ IP (compromised account).
        Timeline stacked bar po godzinach pokazuje pulse aktywności.
      </OnboardingCard>

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
              <LeafletMap markers={data.markers} />
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
    return (
      <EmptyState
        compact
        icon={<Globe className="w-6 h-6" />}
        title="Brak danych geograficznych"
        description="Geo lookup zaktualizuje listę przy następnym ataku z publicznego IP. Lokalne IP (10.x, 192.168) są pomijane."
      />
    );
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
          for (const sev of ["critical", "high", "medium", "low", "info"]) {
            const n = b.bySeverity[sev] ?? 0;
            if (n > 0 && b.total > 0) {
              segs.push({
                sev,
                pct: (n / b.total) * 100,
                color: SEVERITY_COLOR[sev as keyof typeof SEVERITY_COLOR],
              });
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
