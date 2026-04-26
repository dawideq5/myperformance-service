"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Ban,
  Database,
  Globe,
  HardDrive,
  Loader2,
  Server,
  Shield,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageShell,
  TabPanel,
  Tabs,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  DashboardPanel as SecurityDashboardPanel,
  EventsPanel as SecurityEventsPanel,
  BlocksPanel as SecurityBlocksPanel,
  AgentsPanel as WazuhPanel,
  type TabId as SecurityTabId,
} from "@/app/admin/security/SecurityClient";

type TabId =
  | "vps"
  | "dns"
  | "resources"
  | "security"
  | "blocks"
  | "wazuh";

interface VpsItem {
  name: string;
  info: {
    displayName: string;
    state: string;
    zone: string;
    offerType: string;
    model: { name: string; disk: number; memory: number; vcore: number };
    vcore: number;
    memoryLimit: number;
    iamState?: string;
  } | null;
  automatedBackup: {
    state: string;
    schedule: string;
    rotation: number;
  } | null;
  lastSnapshot: {
    id: string;
    description: string;
    creationDate: string;
    region: string;
  } | null;
  ips: string[];
}

interface DnsRecord {
  id: number;
  fieldType: string;
  subDomain: string;
  target: string;
  ttl: number;
  zone: string;
}


export function InfrastructureClient({
  userLabel,
  userEmail,
}: {
  userLabel?: string;
  userEmail?: string;
}) {
  const [tab, setTab] = useState<TabId>("vps");
  const tabs: TabDefinition<TabId>[] = useMemo(
    () => [
      { id: "vps", label: "VPS + Backup", icon: <Server className="w-5 h-5" /> },
      { id: "dns", label: "DNS Zone", icon: <Globe className="w-5 h-5" /> },
      {
        id: "resources",
        label: "Zasoby (CPU/RAM/Disk)",
        icon: <Activity className="w-5 h-5" />,
      },
      {
        id: "security",
        label: "Bezpieczeństwo / Alerty",
        icon: <ShieldAlert className="w-5 h-5" />,
      },
      {
        id: "blocks",
        label: "Zablokowane IP",
        icon: <Ban className="w-5 h-5" />,
      },
      { id: "wazuh", label: "Wazuh SIEM", icon: <Shield className="w-5 h-5" /> },
    ],
    [],
  );

  // Mapowanie naszego TabId → SecurityTabId dla DashboardPanel.onGoTo
  const goToSecurityTab = (st: SecurityTabId) => {
    if (st === "dashboard") setTab("security");
    else if (st === "events") setTab("security");
    else if (st === "blocks") setTab("blocks");
    else if (st === "agents") setTab("wazuh");
  };

  const header = (
    <AppHeader
      backHref="/dashboard"
      title="Infrastruktura serwera"
      userLabel={userLabel}
      userSubLabel={userEmail}
    />
  );

  return (
    <PageShell maxWidth="xl" header={header}>
      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <Tabs
            tabs={tabs}
            activeTab={tab}
            onChange={setTab}
            orientation="vertical"
            ariaLabel="Sekcje infrastruktury serwera"
          />
        </aside>
        <div className="lg:col-span-3 space-y-6">
          <TabPanel tabId="vps" active={tab === "vps"}>
            <VpsPanel />
          </TabPanel>
          <TabPanel tabId="dns" active={tab === "dns"}>
            <DnsPanel />
          </TabPanel>
          <TabPanel tabId="resources" active={tab === "resources"}>
            <ResourcesPanel />
          </TabPanel>
          <TabPanel tabId="security" active={tab === "security"}>
            <div className="space-y-6">
              <SecurityDashboardPanel onGoTo={goToSecurityTab} />
              <SecurityEventsPanel />
            </div>
          </TabPanel>
          <TabPanel tabId="blocks" active={tab === "blocks"}>
            <SecurityBlocksPanel />
          </TabPanel>
          <TabPanel tabId="wazuh" active={tab === "wazuh"}>
            <WazuhPanel />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}

// ── VPS panel ───────────────────────────────────────────────────────────────

function VpsPanel() {
  const [vps, setVps] = useState<VpsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotting, setSnapshotting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ vps: VpsItem[] }>(
        "/api/admin/infrastructure/vps",
      );
      setVps(r.vps);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function takeSnapshot(name: string) {
    if (!confirm(`Utworzyć snapshot VPS ${name}?\n\nProces zajmuje kilka minut. VPS pozostaje dostępny.`)) return;
    setSnapshotting(name);
    setNotice(null);
    setError(null);
    try {
      const r = await api.post<{ message: string }, { vpsName: string }>(
        "/api/admin/infrastructure/snapshot",
        { vpsName: name },
      );
      setNotice(r.message);
      setTimeout(load, 5000);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Snapshot failed");
    } finally {
      setSnapshotting(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader
          icon={<Server className="w-6 h-6 text-[var(--accent)]" />}
          title="Twoje VPS w OVH Cloud"
          description="Pełne info, automated backup OVH, snapshoty manualne, lista IP. Dane pobierane live z OVH API."
        />
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Pobieram z OVH…
        </div>
      )}

      {vps.map((v) => (
        <Card key={v.name} padding="lg">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold">
                {v.info?.displayName ?? v.name}
              </h3>
              <code className="text-[11px] text-[var(--text-muted)]">
                {v.name}
              </code>
            </div>
            {v.info?.state && (
              <Badge tone={v.info.state === "running" ? "success" : "warning"}>
                {v.info.state}
              </Badge>
            )}
          </div>

          {v.info && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs mb-4">
              <Field
                label="Plan"
                value={`${v.info.model.name} (${v.info.offerType})`}
              />
              <Field label="Region" value={v.info.zone} />
              <Field
                label="CPU"
                value={`${v.info.vcore} vCPU`}
              />
              <Field
                label="RAM"
                value={`${(v.info.memoryLimit / 1024).toFixed(0)} GB`}
              />
              <Field
                label="Disk"
                value={`${v.info.model.disk} GB SSD`}
              />
              <Field label="IAM" value={v.info.iamState ?? "—"} />
            </div>
          )}

          {v.ips.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] uppercase text-[var(--text-muted)] mb-1">
                Adresy IP
              </div>
              <div className="flex flex-wrap gap-1.5">
                {v.ips.map((ip) => (
                  <code
                    key={ip}
                    className="text-[11px] bg-[var(--bg-main)] px-2 py-1 rounded"
                  >
                    {ip}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Card padding="md" className="bg-[var(--bg-main)]">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-semibold">Automated backup OVH</h4>
              </div>
              {v.automatedBackup ? (
                <div className="text-xs space-y-1 text-[var(--text-muted)]">
                  <div>
                    Status:{" "}
                    <Badge
                      tone={
                        v.automatedBackup.state === "enabled"
                          ? "success"
                          : "warning"
                      }
                    >
                      {v.automatedBackup.state}
                    </Badge>
                  </div>
                  <div>
                    Codziennie o:{" "}
                    <code className="text-[var(--text-main)]">
                      {v.automatedBackup.schedule}
                    </code>{" "}
                    UTC
                  </div>
                  <div>
                    Retencja:{" "}
                    <strong className="text-[var(--text-main)]">
                      {v.automatedBackup.rotation}
                    </strong>{" "}
                    {v.automatedBackup.rotation === 1 ? "kopia" : "kopie"}
                  </div>
                  <p className="mt-2 text-[10px]">
                    Snapshot całego VPS na infrastrukturze OVH. Restoruje stan
                    serwera (cały dysk) — potrzebny gdy padnie cały system, nie
                    pojedyncza apka.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  Automated backup nieaktywny.
                </p>
              )}
            </Card>

            <Card padding="md" className="bg-[var(--bg-main)]">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-4 h-4 text-sky-400" />
                <h4 className="text-sm font-semibold">Manualny snapshot</h4>
              </div>
              {v.lastSnapshot ? (
                <div className="text-xs text-[var(--text-muted)] mb-3">
                  Ostatni:{" "}
                  <strong className="text-[var(--text-main)]">
                    {new Date(v.lastSnapshot.creationDate).toLocaleString("pl-PL")}
                  </strong>
                  <br />
                  Region:{" "}
                  <code>{v.lastSnapshot.region}</code>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  Brak snapshotu.
                </p>
              )}
              <Button
                size="sm"
                onClick={() => takeSnapshot(v.name)}
                loading={snapshotting === v.name}
                fullWidth
              >
                Utwórz snapshot teraz
              </Button>
              <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                Użyj przed dużymi zmianami (np. migracja DB).
              </p>
            </Card>
          </div>
        </Card>
      ))}

      <Card padding="md">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-amber-400" /> Backup baz danych
          (server-side)
        </h4>
        <div className="text-xs text-[var(--text-muted)] space-y-1">
          <div>
            • Codzienny pełen dump 8 baz + Coolify config + Traefik certs
          </div>
          <div>
            • Uruchamiany cronem na hoście:{" "}
            <code>/etc/cron.d/myperformance-backup</code> · 23:00 UTC
          </div>
          <div>
            • Lokalizacja:{" "}
            <code>/backups/myperformance/YYYY-MM-DD_HH-MM/</code>
          </div>
          <div>• Retencja 7 dni · email-raport po wykonaniu</div>
        </div>
        <div className="mt-3 text-[11px] text-[var(--text-muted)]">
          <strong className="text-[var(--text-main)]">
            Razem masz 3 warstwy:
          </strong>{" "}
          (1) Automated backup OVH 22:39 = full disk snapshot, off-site, off-host;
          (2) cron 23:00 = per-database dump + Coolify config; (3) snapshot
          ręczny = punkt-w-czasie przed zmianą.
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-[var(--text-muted)]">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

// ── DNS Zone panel ──────────────────────────────────────────────────────────

function DnsPanel() {
  const [zone, setZone] = useState("myperformance.pl");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async (z: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{
        records: DnsRecord[];
        total: number;
      }>(`/api/admin/infrastructure/dns?zone=${encodeURIComponent(z)}`);
      setRecords(r.records);
      setTotal(r.total);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(zone);
  }, [zone, load]);

  const filtered = useMemo(() => {
    if (!filter) return records;
    const f = filter.toLowerCase();
    return records.filter(
      (r) =>
        r.subDomain.toLowerCase().includes(f) ||
        r.target.toLowerCase().includes(f) ||
        r.fieldType.toLowerCase().includes(f),
    );
  }, [records, filter]);

  async function deleteRecord(id: number) {
    if (!confirm("Usunąć ten rekord DNS?")) return;
    try {
      await api.delete(
        `/api/admin/infrastructure/dns?zone=${encodeURIComponent(zone)}&id=${id}`,
      );
      await load(zone);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader
          icon={<Globe className="w-6 h-6 text-[var(--accent)]" />}
          title="DNS Zone — zarządzanie rekordami"
          description="Pełna kontrola nad strefą DNS przez OVH API. Dodawanie/usuwanie rekordów, auto-refresh strefy po zmianie. Automatyczne dodawanie SPF/DKIM/CNAME dla nowych usług."
        />
        <div className="mt-4 flex gap-2">
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          >
            <option value="myperformance.pl">myperformance.pl</option>
            <option value="pakietochronny.pl">pakietochronny.pl</option>
            <option value="zlecenieserwisowe.pl">zlecenieserwisowe.pl</option>
          </select>
          <input
            type="text"
            className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            placeholder="Filtruj po subdomain / target / type…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Pobieram strefę…
        </div>
      )}

      <Card padding="md">
        <div className="text-[11px] text-[var(--text-muted)] mb-2">
          {filtered.length} z {total} rekord(ów)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                <th className="py-2 px-2">Type</th>
                <th className="py-2 px-2">Subdomain</th>
                <th className="py-2 px-2">Target</th>
                <th className="py-2 px-2">TTL</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border-subtle)]/50"
                >
                  <td className="py-1.5 px-2">
                    <Badge tone="neutral">{r.fieldType}</Badge>
                  </td>
                  <td className="py-1.5 px-2 font-mono">
                    {r.subDomain || <span className="opacity-60">@</span>}
                  </td>
                  <td className="py-1.5 px-2 font-mono break-all max-w-[400px]">
                    {r.target}
                  </td>
                  <td className="py-1.5 px-2 text-[var(--text-muted)]">
                    {r.ttl}s
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <button
                      type="button"
                      onClick={() => deleteRecord(r.id)}
                      className="text-[10px] text-red-400 hover:underline"
                    >
                      usuń
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}


// ── Resources panel — VPS metrics + Docker containers ──────────────────────

interface MachineInfo {
  ncpu: number | null;
  memTotal: number | null;
  containersRunning: number | null;
  containersStopped: number | null;
  kernel: string | null;
  driver: string | null;
}

interface ContainerStat {
  name: string;
  image: string;
  status: string;
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  netRx: number;
  netTx: number;
  blockRead: number;
  blockWrite: number;
}

interface ResourcesData {
  machine: MachineInfo;
  containers: ContainerStat[];
  collectedAt: string;
  errors: string[];
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;
function fmtBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(2)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function ResourcesPanel() {
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
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" /> Pobieram metryki…
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
        />
        <UsageGauge
          label="RAM"
          value={totalContainerMem / GB}
          max={(data.machine.memTotal ?? 16 * GB) / GB}
          unit="GB"
          icon={<Database className="w-4 h-4" />}
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

function UsageGauge({
  label,
  value,
  max,
  unit,
  icon,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  icon: React.ReactNode;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone =
    pct >= 90 ? "danger" : pct >= 70 ? "warning" : "success";
  const colorClass =
    tone === "danger"
      ? "bg-red-500"
      : tone === "warning"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 text-[var(--text-muted)] text-[11px] mb-2">
        {icon}
        <span className="uppercase tracking-wide">{label}</span>
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
            <div className="font-mono truncate" title={c.name}>
              {c.name.replace(/-[0-9a-f]{12,}/, "…")}
            </div>
            {metric === "full" && (
              <div className="text-[10px] text-[var(--text-muted)]">
                CPU {c.cpuPercent.toFixed(1)}% · RAM {fmtBytes(c.memUsage)}
                {" · "}↓{fmtBytes(c.netRx)} ↑{fmtBytes(c.netTx)}
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
