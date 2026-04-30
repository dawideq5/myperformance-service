"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Database,
  HardDrive,
  Server,
  TrendingUp,
} from "lucide-react";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  InfoTooltip,
  OnboardingCard,
  Skeleton,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  GB,
  PALETTE,
  aggregateByApp,
  fmtBytes,
  usageColorClass,
  usageTone,
  type ContainerStat,
  type DockerStorage,
  type ResourcesData,
} from "@/lib/services/infrastructure-service";

export function ResourcesPanel() {
  const [data, setData] = useState<ResourcesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get<ResourcesData>(
        "/api/admin/infrastructure/resources",
      );
      setData(r);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (loading || !data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Pobieranie metryk">
        <Card padding="md">
          <Skeleton className="h-5 w-48 mb-2" />
          <Skeleton className="h-3 w-3/4" />
        </Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card padding="md" key={i}>
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-7 w-16 mb-2" />
              <Skeleton className="h-1.5 w-full" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card padding="md" key={i}>
              <Skeleton className="h-4 w-32 mb-3" />
              <Skeleton className="h-44 w-44 rounded-full mx-auto" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const totalContainerCpu = data.containers.reduce(
    (s, c) => s + c.cpuPercent,
    0,
  );
  const totalContainerMem = data.containers.reduce(
    (s, c) => s + c.memUsage,
    0,
  );
  const sortedByCpu = [...data.containers].sort(
    (a, b) => b.cpuPercent - a.cpuPercent,
  );
  const sortedByMem = [...data.containers].sort(
    (a, b) => b.memUsage - a.memUsage,
  );

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader
          icon={<Activity className="w-6 h-6 text-[var(--accent)]" />}
          title="Monitoring zasobów"
          description={`Live metryki Dockera (per-kontener). Aktualizacja co 15 s. Ostatnio: ${new Date(data.collectedAt).toLocaleTimeString("pl-PL")}.${data.machine.driver ? ` · driver: ${data.machine.driver}` : ""}`}
        />
      </Card>

      <OnboardingCard
        storageKey="resources-panel"
        title="Co tu widzisz"
      >
        Dane idą z <code>tecnativa/docker-socket-proxy</code> (read-only,
        bez POST). CPU% to suma per-container delta cpu / system × online_cpus —
        może przekraczać 100% (n × vCPU). RAM = working set bez page cache.
        Donut RAM grupuje kontenery po aplikacji (Coolify labels). ROM
        section pokazuje breakdown overlay storage z <code>/system/df</code>{" "}
        (cache 5 min).
      </OnboardingCard>

      {data.errors.length > 0 && (
        <Alert tone="warning" title="Część metryk niedostępna">
          {data.errors.join(" · ")}
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <UsageGauge
          label="CPU"
          value={totalContainerCpu}
          max={(data.machine.ncpu ?? 1) * 100}
          unit="%"
          icon={<Activity className="w-4 h-4" />}
          info={
            <div className="space-y-1.5">
              <div className="font-semibold">CPU usage (suma kontenerów)</div>
              <div>Suma CPU% wszystkich kontenerów Docker (delta cpu_usage / system_cpu_usage × online_cpus). 100% = pełne użycie 1 vCPU.</div>
              <div className="text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                Max = vCPU hosta × 100%. Powyżej 70% = warning, 90% = danger.
              </div>
            </div>
          }
        />
        <UsageGauge
          label="RAM"
          value={totalContainerMem / GB}
          max={(data.machine.memTotal ?? 16 * GB) / GB}
          unit="GB"
          icon={<Database className="w-4 h-4" />}
          info={
            <div className="space-y-1.5">
              <div className="font-semibold">RAM (suma kontenerów)</div>
              <div>Suma working set memory bez page cache (memory.usage − memory.stats.cache).</div>
              <div className="text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                Max = RAM hosta. Linux trzyma cache aż go potrzebuje — to nie jest {"\u201E"}realne{"\u201D"} użycie.
              </div>
            </div>
          }
        />
        <Card padding="md">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-[11px] mb-2">
            <Server className="w-4 h-4" />
            <span className="uppercase tracking-wide">Kontenery</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {data.machine.containersRunning ?? data.containers.length}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
            running
            {data.machine.containersStopped !== null
              ? ` · ${data.machine.containersStopped} stopped`
              : ""}
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-[11px] mb-2">
            <HardDrive className="w-4 h-4" />
            <span className="uppercase tracking-wide">vCPU / RAM host</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {data.machine.ncpu ?? "?"}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
            vCPU · {data.machine.memTotal ? fmtBytes(data.machine.memTotal) : "?"}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="md">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Database className="w-4 h-4" />
            RAM per aplikacja
          </h4>
          <MemoryDonut containers={data.containers} />
        </Card>

        <Card padding="md">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            CPU per aplikacja
          </h4>
          <AppCpuList containers={data.containers} />
        </Card>
      </div>

      <Card padding="md">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <HardDrive className="w-4 h-4" />
          Pamięć dyskowa (ROM) — Docker overlay
        </h4>
        {data.storage ? (
          <StorageBreakdown storage={data.storage} />
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            Brak danych z /system/df.
          </p>
        )}
      </Card>

      <Card padding="md">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Top kontenery (CPU)
        </h4>
        <ContainerList items={sortedByCpu.slice(0, 10)} metric="cpu" />
      </Card>

      <Card padding="md">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Database className="w-4 h-4" />
          Top kontenery (RAM)
        </h4>
        <ContainerList items={sortedByMem.slice(0, 10)} metric="mem" />
      </Card>

      <Card padding="md">
        <h4 className="text-sm font-semibold mb-3">
          Wszystkie kontenery ({data.containers.length})
        </h4>
        <ContainerList items={data.containers} metric="full" />
      </Card>
    </div>
  );
}

function MemoryDonut({ containers }: { containers: ContainerStat[] }) {
  const apps = aggregateByApp(containers);
  const total = apps.reduce((s, a) => s + a.mem, 0);
  if (total === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)]">Brak danych RAM.</p>
    );
  }
  const radius = 72;
  const stroke = 22;
  const circ = 2 * Math.PI * radius;
  let cum = 0;
  const slices = apps.map((a, idx) => {
    const frac = a.mem / total;
    const dasharray = `${frac * circ} ${circ}`;
    const dashoffset = -cum * circ;
    cum += frac;
    return { ...a, frac, dasharray, dashoffset, color: PALETTE[idx % PALETTE.length] };
  });
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="relative" style={{ width: 180, height: 180 }}>
        <svg
          width={180}
          height={180}
          viewBox="0 0 180 180"
          className="-rotate-90"
        >
          <circle
            cx={90}
            cy={90}
            r={radius}
            fill="none"
            stroke="var(--bg-main)"
            strokeWidth={stroke}
          />
          {slices.map((s) => (
            <circle
              key={s.app}
              cx={90}
              cy={90}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={s.dasharray}
              strokeDashoffset={s.dashoffset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <div className="text-base font-bold tabular-nums">
            {fmtBytes(total)}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
            RAM razem
          </div>
        </div>
      </div>
      <ul className="flex-1 space-y-1 min-w-[200px]">
        {slices.map((s) => (
          <li
            key={s.app}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ background: s.color }}
              />
              <span className="truncate" title={s.app}>
                {s.app}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                ({s.containers})
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-mono tabular-nums">
                {fmtBytes(s.mem)}
              </span>
              <Badge tone="neutral">
                {(s.frac * 100).toFixed(1)}%
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppCpuList({ containers }: { containers: ContainerStat[] }) {
  const apps = aggregateByApp(containers).sort((a, b) => b.cpu - a.cpu);
  if (apps.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">Brak danych.</p>;
  }
  const max = Math.max(...apps.map((a) => a.cpu));
  return (
    <ul className="space-y-2">
      {apps.map((a, i) => {
        const pct = max > 0 ? (a.cpu / max) * 100 : 0;
        return (
          <li key={a.app} className="text-xs">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="truncate">{a.app}</span>
              </div>
              <span className="font-mono tabular-nums">
                {a.cpu.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--bg-main)] overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: PALETTE[i % PALETTE.length],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StorageBreakdown({ storage }: { storage: DockerStorage }) {
  const items = [
    { label: "Layers (overlay)", value: storage.layers, color: "#6366f1" },
    {
      label: `Images (${storage.imagesCount})`,
      value: storage.imagesSize,
      color: "#10b981",
    },
    {
      label: "Containers (RW)",
      value: storage.containersSize,
      color: "#f59e0b",
    },
    { label: "Volumes (named)", value: storage.volumesSize, color: "#8b5cf6" },
    {
      label: "Build cache",
      value: storage.buildCacheSize,
      color: "#06b6d4",
    },
  ];
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-[var(--text-muted)]">
          Razem dysk Docker
        </span>
        <span className="text-lg font-bold tabular-nums">
          {fmtBytes(total)}
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-[var(--bg-main)]">
        {items.map((i) =>
          i.value > 0 ? (
            <div
              key={i.label}
              style={{
                width: `${(i.value / total) * 100}%`,
                background: i.color,
              }}
              title={`${i.label}: ${fmtBytes(i.value)}`}
            />
          ) : null,
        )}
      </div>
      <ul className="grid sm:grid-cols-2 gap-1.5">
        {items.map((i) => (
          <li
            key={i.label}
            className="flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm"
                style={{ background: i.color }}
              />
              <span>{i.label}</span>
            </div>
            <span className="font-mono tabular-nums text-[var(--text-muted)]">
              {fmtBytes(i.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UsageGauge({
  label,
  value,
  max,
  unit,
  icon,
  info,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  icon: React.ReactNode;
  info?: React.ReactNode;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone = usageTone(pct);
  const colorClass = usageColorClass(tone);
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 text-[var(--text-muted)] text-[11px] mb-2">
        {icon}
        <span className="uppercase tracking-wide">{label}</span>
        {info && <InfoTooltip content={info} />}
      </div>
      <div className="text-2xl font-bold">
        {value.toFixed(unit === "%" ? 1 : 2)}
        <span className="text-sm font-normal text-[var(--text-muted)] ml-1">
          {unit}
        </span>
      </div>
      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
        z {max.toFixed(unit === "%" ? 0 : 1)} {unit}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-main)] overflow-hidden">
        <div
          className={`h-full ${colorClass} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
}

function ContainerList({
  items,
  metric,
}: {
  items: ContainerStat[];
  metric: "cpu" | "mem" | "full";
}) {
  if (items.length === 0)
    return (
      <p className="text-xs text-[var(--text-muted)]">
        Brak danych z Docker stats.
      </p>
    );
  return (
    <ul className="space-y-1.5">
      {items.map((c) => (
        <li
          key={c.name}
          className="flex items-center justify-between text-xs gap-2"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone="accent">{c.app}</Badge>
              <span className="font-mono truncate text-[11px]" title={c.name}>
                {c.name.replace(/-[0-9a-f]{12,}/, "…")}
              </span>
            </div>
            {metric === "full" && (
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                CPU {c.cpuPercent.toFixed(1)}% · RAM {fmtBytes(c.memUsage)}
                {" · "}↓{fmtBytes(c.netRx)} ↑{fmtBytes(c.netTx)}
                {c.diskRw > 0 && ` · disk ${fmtBytes(c.diskRw)}`}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {(metric === "cpu" || metric === "full") && (
              <span className="font-mono text-[var(--text-muted)] tabular-nums">
                {c.cpuPercent.toFixed(1)}%
              </span>
            )}
            {(metric === "mem" || metric === "full") && (
              <span className="font-mono text-[var(--text-muted)] tabular-nums">
                {fmtBytes(c.memUsage)}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
