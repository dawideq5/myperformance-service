"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe,
  HardDrive,
  Loader2,
  Power,
  Server,
  Shield,
  Wrench,
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
  Textarea,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { api, ApiRequestError } from "@/lib/api-client";

type TabId = "vps" | "dns" | "maintenance";

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

interface MaintenanceState {
  enabled: boolean;
  message: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  startedBy: string | null;
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
        id: "maintenance",
        label: "Tryb konserwacji",
        icon: <Wrench className="w-5 h-5" />,
      },
    ],
    [],
  );

  const header = (
    <AppHeader
      backHref="/dashboard"
      title="Infrastruktura OVH"
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
            ariaLabel="Sekcje infrastruktury"
          />
        </aside>
        <div className="lg:col-span-3 space-y-6">
          <TabPanel tabId="vps" active={tab === "vps"}>
            <VpsPanel />
          </TabPanel>
          <TabPanel tabId="dns" active={tab === "dns"}>
            <DnsPanel />
          </TabPanel>
          <TabPanel tabId="maintenance" active={tab === "maintenance"}>
            <MaintenancePanel />
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

// ── Maintenance panel ───────────────────────────────────────────────────────

function MaintenancePanel() {
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [duration, setDuration] = useState(240);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ maintenance: MaintenanceState }>(
        "/api/admin/maintenance",
      );
      setState(r.maintenance);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(enabled: boolean) {
    if (
      enabled &&
      !confirm(
        'Włączyć tryb konserwacji?\n\nUżytkownicy nie-admin zostaną przekierowani na stronę „prace serwisowe". Ty (admin) nadal masz pełen dostęp.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.put<{ maintenance: MaintenanceState }, {
        enabled: boolean;
        message?: string;
        durationMinutes?: number;
      }>("/api/admin/maintenance", {
        enabled,
        message: draftMessage || undefined,
        durationMinutes: duration,
      });
      setState(r.maintenance);
      setNotice(
        enabled
          ? "Tryb konserwacji włączony. Użytkownicy widzą stronę informacyjną."
          : "Tryb konserwacji wyłączony. Platforma znowu dostępna.",
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Toggle failed");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader
          icon={<Wrench className="w-6 h-6 text-[var(--accent)]" />}
          title="Tryb konserwacji / prac"
          description="Blokuje dostęp dla użytkowników (przekierowuje na stronę 'prace serwisowe'). Admin (Ty) nadal ma pełen dostęp do platformy żeby pracować w spokoju."
        />
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {state.enabled ? (
        <Card padding="lg" className="border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-amber-400">
                Tryb konserwacji AKTYWNY
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Włączony{" "}
                {state.startedAt
                  ? new Date(state.startedAt).toLocaleString("pl-PL")
                  : "?"}
                {state.startedBy ? ` przez ${state.startedBy}` : ""}
              </p>
              {state.expiresAt && (
                <p className="text-xs text-[var(--text-muted)]">
                  Auto-wyłączenie:{" "}
                  {new Date(state.expiresAt).toLocaleString("pl-PL")}
                </p>
              )}
              {state.message && (
                <div className="mt-3 p-3 rounded bg-[var(--bg-main)] text-xs">
                  <strong>Komunikat dla user-ów:</strong> {state.message}
                </div>
              )}
            </div>
          </div>
          <Button
            onClick={() => toggle(false)}
            loading={busy}
            leftIcon={<Power className="w-4 h-4" />}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Wyłącz tryb konserwacji
          </Button>
        </Card>
      ) : (
        <Card padding="lg">
          <div className="flex items-start gap-3 mb-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            <div>
              <h3 className="text-base font-semibold">Platforma aktywna</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Wszyscy użytkownicy mają normalny dostęp.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">
                Komunikat dla użytkowników (opcjonalny — pojawi się na stronie 503)
              </label>
              <Textarea
                rows={3}
                value={draftMessage}
                onChange={(e) => setDraftMessage(e.target.value)}
                placeholder='np. "Aktualizacja systemu kalendarzy — wracamy ok. 23:30"'
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">
                Auto-wyłączenie po (minuty) — bezpiecznik
              </label>
              <select
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                <option value={30}>30 minut</option>
                <option value={60}>1 godzina</option>
                <option value={120}>2 godziny</option>
                <option value={240}>4 godziny (default)</option>
                <option value={480}>8 godzin</option>
                <option value={1440}>24 godziny</option>
              </select>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                Po tym czasie tryb wyłączy się automatycznie (chroni przed
                zostawieniem włączonym).
              </p>
            </div>
            <Button
              onClick={() => toggle(true)}
              loading={busy}
              leftIcon={<Wrench className="w-4 h-4" />}
            >
              Włącz tryb konserwacji
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
