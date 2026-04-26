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
  InfoTooltip,
  PageShell,
  TabPanel,
  Tabs,
  useConfirm,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  DashboardPanel as SecurityDashboardPanel,
  EventsPanel as SecurityEventsPanel,
  AgentsPanel as WazuhPanel,
  type TabId as SecurityTabId,
} from "@/app/admin/security/SecurityClient";
import { IntelBlocksPanel } from "./IntelBlocksPanel";
import { EventMapPanel } from "./EventMapPanel";
import { DevicesPanel } from "./DevicesPanel";

type TabId =
  | "vps"
  | "dns"
  | "resources"
  | "security"
  | "blocks"
  | "map"
  | "devices"
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
        label: "Threat Intel — IP",
        icon: <Ban className="w-5 h-5" />,
      },
      {
        id: "map",
        label: "Mapa & analityka",
        icon: <Globe className="w-5 h-5" />,
      },
      {
        id: "devices",
        label: "Urządzenia",
        icon: <HardDrive className="w-5 h-5" />,
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
            <IntelBlocksPanel />
          </TabPanel>
          <TabPanel tabId="map" active={tab === "map"}>
            <EventMapPanel />
          </TabPanel>
          <TabPanel tabId="devices" active={tab === "devices"}>
            <DevicesPanel />
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
  const { confirm, ConfirmDialogElement } = useConfirm();

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

  async function takeSnapshot(name: string, force = false) {
    const ok = await confirm({
      title: force
        ? `Nadpisać snapshot VPS ${name}?`
        : `Utworzyć snapshot VPS ${name}?`,
      tone: force ? "warning" : "info",
      description: force
        ? `Stary snapshot zostanie permanentnie usunięty, a nowy utworzony w jego miejsce.`
        : `OVH wykona migawkę dysku VPS — kopia stanu na ten moment, możliwa do przywrócenia z OVH Manager.`,
      consequences: [
        `Proces zajmuje 3-5 minut`,
        `VPS pozostaje w pełni dostępny podczas snapshotu`,
        `OVH limit: 1 aktywny snapshot per VPS`,
        force
          ? `poprzedni snapshot zostanie usunięty BEZ MOŻLIWOŚCI ODZYSKANIA`
          : `nowy snapshot pojawi się w polu „lastSnapshot" po odświeżeniu`,
      ],
      confirmLabel: force ? "Nadpisz snapshot" : "Utwórz snapshot",
    });
    if (!ok) return;
    setSnapshotting(name);
    setNotice(null);
    setError(null);
    try {
      const r = await api.post<
        { message: string },
        { vpsName: string; force?: boolean }
      >("/api/admin/infrastructure/snapshot", { vpsName: name, force });
      setNotice(r.message);
      setTimeout(load, 5000);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        const proceed = await confirm({
          title: "Snapshot już istnieje",
          tone: "warning",
          description: err.message,
          consequences: [
            "Stary snapshot zostanie usunięty przed utworzeniem nowego",
            "Operacja jest nieodwracalna",
          ],
          confirmLabel: "Nadpisz",
        });
        if (proceed) return takeSnapshot(name, true);
      } else {
        setError(
          err instanceof ApiRequestError ? err.message : "Snapshot failed",
        );
      }
    } finally {
      setSnapshotting(null);
    }
  }

  async function removeSnapshot(name: string) {
    const ok = await confirm({
      title: `Usunąć snapshot VPS ${name}?`,
      tone: "danger",
      description: "Snapshot zostanie permanentnie usunięty z OVH.",
      consequences: [
        "Operacja nieodwracalna — nie ma kosza",
        "Po usunięciu nie będzie można przywrócić VPS do tego stanu",
        "Możesz utworzyć nowy snapshot kiedy zechcesz",
      ],
      confirmLabel: "Usuń snapshot",
    });
    if (!ok) return;
    setSnapshotting(name);
    setError(null);
    setNotice(null);
    try {
      const r = await api.delete<{ message: string }>(
        `/api/admin/infrastructure/snapshot?vpsName=${encodeURIComponent(name)}`,
      );
      setNotice(r.message);
      setTimeout(load, 3000);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Delete failed");
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
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => takeSnapshot(v.name)}
                  loading={snapshotting === v.name}
                  fullWidth
                >
                  {v.lastSnapshot ? "Nadpisz snapshot" : "Utwórz snapshot teraz"}
                </Button>
                {v.lastSnapshot && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeSnapshot(v.name)}
                    loading={snapshotting === v.name}
                    fullWidth
                  >
                    Usuń snapshot
                  </Button>
                )}
              </div>
              <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                OVH limit: 1 aktywny snapshot per VPS. {"\u201E"}Nadpisz{"\u201D"} usuwa stary i tworzy nowy.
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
      {ConfirmDialogElement}
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
  const { confirm, ConfirmDialogElement } = useConfirm();

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
    const rec = records.find((r) => r.id === id);
    const ok = await confirm({
      title: "Usunąć rekord DNS?",
      tone: "danger",
      description: rec
        ? `${rec.fieldType} ${rec.subDomain || "@"} → ${rec.target}`
        : "Rekord zostanie usunięty.",
      consequences: [
        "Zmiana propaguje się w DNS w 1-15 min (zależnie od TTL)",
        rec?.fieldType === "MX"
          ? "Usunięcie MX może przerwać dostarczanie maili z tego subdomenu"
          : null,
        rec?.fieldType === "CNAME" || rec?.fieldType === "A"
          ? "Aplikacja pod tym subdomenem przestanie odpowiadać"
          : null,
        "OVH wykona refresh strefy automatycznie",
      ].filter(Boolean) as React.ReactNode[],
      confirmLabel: "Usuń rekord",
    });
    if (!ok) return;
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
      {ConfirmDialogElement}
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
  app: string;
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
  diskRw: number;
  diskRootFs: number;
}

interface DockerStorage {
  layers: number;
  imagesCount: number;
  imagesSize: number;
  containersSize: number;
  volumesSize: number;
  buildCacheSize: number;
}

interface ResourcesData {
  machine: MachineInfo;
  containers: ContainerStat[];
  storage: DockerStorage | null;
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

// ── Aggregation helpers ────────────────────────────────────────────────────

interface AppAggregate {
  app: string;
  cpu: number;
  mem: number;
  containers: number;
}

function aggregateByApp(containers: ContainerStat[]): AppAggregate[] {
  const map = new Map<string, AppAggregate>();
  for (const c of containers) {
    const cur = map.get(c.app) ?? {
      app: c.app,
      cpu: 0,
      mem: 0,
      containers: 0,
    };
    cur.cpu += c.cpuPercent;
    cur.mem += c.memUsage;
    cur.containers += 1;
    map.set(c.app, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.mem - a.mem);
}

const PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  "#3b82f6", "#a855f7", "#64748b", "#eab308", "#22c55e",
];

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
