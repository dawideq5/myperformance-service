"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  ChevronRight,
  Globe,
  Loader2,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
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

type TabId = "dashboard" | "events" | "blocks" | "agents";

type Severity = "info" | "low" | "medium" | "high" | "critical";

interface SecurityEvent {
  id: number;
  ts: string;
  severity: Severity;
  category: string;
  source: string;
  title: string;
  description: string | null;
  srcIp: string | null;
  targetUser: string | null;
  details: Record<string, unknown> | null;
  acknowledged: boolean;
}

interface BlockedIp {
  ip: string;
  reason: string;
  blockedAt: string;
  expiresAt: string | null;
  blockedBy: string;
  source: string;
  attempts: number;
  country: string | null;
}

interface DashboardStats {
  alertsLast24h: number;
  alertsLast7d: number;
  bySeverity: Record<Severity, number>;
  byCategory: Array<{ category: string; count: number }>;
  topSrcIps: Array<{ ip: string; count: number }>;
  blockedIps: number;
}

const SEVERITY_TONE: Record<Severity, "neutral" | "warning" | "danger" | "success"> = {
  info: "neutral",
  low: "neutral",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  low: "Niski",
  medium: "Średni",
  high: "Wysoki",
  critical: "Krytyczny",
};

export function SecurityClient({
  userLabel,
  userEmail,
}: {
  userLabel?: string;
  userEmail?: string;
}) {
  const [tab, setTab] = useState<TabId>("dashboard");
  const tabs: TabDefinition<TabId>[] = useMemo(
    () => [
      { id: "dashboard", label: "Dashboard", icon: <TrendingUp className="w-5 h-5" /> },
      { id: "events", label: "Alerty / zdarzenia", icon: <ShieldAlert className="w-5 h-5" /> },
      { id: "blocks", label: "Zablokowane IP", icon: <Ban className="w-5 h-5" /> },
      { id: "agents", label: "Agenci (Wazuh)", icon: <Server className="w-5 h-5" /> },
    ],
    [],
  );

  const header = (
    <AppHeader
      backHref="/dashboard"
      title="Bezpieczeństwo / SIEM"
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
            ariaLabel="Sekcje bezpieczeństwa"
          />
        </aside>
        <div className="lg:col-span-3 space-y-6">
          <TabPanel tabId="dashboard" active={tab === "dashboard"}>
            <DashboardPanel onGoTo={setTab} />
          </TabPanel>
          <TabPanel tabId="events" active={tab === "events"}>
            <EventsPanel />
          </TabPanel>
          <TabPanel tabId="blocks" active={tab === "blocks"}>
            <BlocksPanel />
          </TabPanel>
          <TabPanel tabId="agents" active={tab === "agents"}>
            <AgentsPanel />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function DashboardPanel({ onGoTo }: { onGoTo: (t: TabId) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardStats>("/api/admin/security/dashboard")
      .then(setStats)
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : "Load failed"),
      );
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!stats)
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie statystyk…
      </div>
    );

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            Centralny widok bezpieczeństwa platformy. Agreguje zdarzenia z:
            Keycloak audit (login attempts, user changes), webhook events
            (cascade delete), Postal SMTP errors, IAM audit log dashboardu,
            manual security events. <strong>Wazuh SIEM</strong> dołączy jako
            dodatkowe źródło po deployu (Phase F).
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Zdarzenia (24h)"
          value={stats.alertsLast24h}
          icon={<Activity className="w-5 h-5 text-sky-400" />}
          onClick={() => onGoTo("events")}
        />
        <KpiCard
          label="Zdarzenia (7d)"
          value={stats.alertsLast7d}
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
        />
        <KpiCard
          label="Krytyczne (7d)"
          value={
            stats.bySeverity.critical + stats.bySeverity.high
          }
          icon={<ShieldAlert className="w-5 h-5 text-red-400" />}
          tone={
            stats.bySeverity.critical + stats.bySeverity.high > 0
              ? "danger"
              : "neutral"
          }
          onClick={() => onGoTo("events")}
        />
        <KpiCard
          label="Zablokowane IP"
          value={stats.blockedIps}
          icon={<Ban className="w-5 h-5 text-amber-400" />}
          onClick={() => onGoTo("blocks")}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card padding="md">
          <h3 className="text-sm font-semibold mb-3">Severity (7 dni)</h3>
          <div className="space-y-2">
            {(Object.keys(stats.bySeverity) as Severity[])
              .filter((s) => stats.bySeverity[s] > 0)
              .map((s) => (
                <div key={s} className="flex items-center gap-3">
                  <Badge tone={SEVERITY_TONE[s]}>{SEVERITY_LABEL[s]}</Badge>
                  <div className="flex-1 h-2 bg-[var(--bg-main)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)]"
                      style={{
                        width: `${Math.min(100, (stats.bySeverity[s] / Math.max(1, stats.alertsLast7d)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono w-12 text-right">
                    {stats.bySeverity[s]}
                  </span>
                </div>
              ))}
            {stats.alertsLast7d === 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                Brak zdarzeń w ostatnich 7 dniach.
              </p>
            )}
          </div>
        </Card>

        <Card padding="md">
          <h3 className="text-sm font-semibold mb-3">Top kategorie (7d)</h3>
          <div className="space-y-1.5">
            {stats.byCategory.map((c) => (
              <div
                key={c.category}
                className="flex items-center justify-between text-xs"
              >
                <code>{c.category}</code>
                <Badge tone="neutral">{c.count}</Badge>
              </div>
            ))}
            {stats.byCategory.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">Brak danych.</p>
            )}
          </div>
        </Card>
      </div>

      {stats.topSrcIps.length > 0 && (
        <Card padding="md">
          <h3 className="text-sm font-semibold mb-3">Top źródłowe IP (7d)</h3>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {stats.topSrcIps.map((s) => (
              <div
                key={s.ip}
                className="flex items-center justify-between text-xs px-3 py-1.5 rounded border border-[var(--border-subtle)]"
              >
                <code>{s.ip}</code>
                <Badge tone="neutral">{s.count} zdarzeń</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "neutral" | "danger" | "success";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`text-left p-4 rounded-xl border transition ${
        tone === "danger"
          ? "border-red-500/40 bg-red-500/5"
          : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
      } ${onClick ? "hover:border-[var(--accent)] cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <div
        className={`text-2xl font-bold ${tone === "danger" ? "text-red-400" : "text-[var(--text-main)]"}`}
      >
        {value}
      </div>
      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{label}</div>
      {onClick && (
        <div className="mt-2 text-[10px] text-[var(--accent)] flex items-center gap-1">
          szczegóły <ChevronRight className="w-3 h-3" />
        </div>
      )}
    </button>
  );
}

// ── Events ──────────────────────────────────────────────────────────────────

function EventsPanel() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = severity ? `?severity=${severity}` : "";
      const r = await api.get<{ events: SecurityEvent[] }>(
        `/api/admin/security/events${qs}`,
      );
      setEvents(r.events);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [severity]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader
          icon={<ShieldAlert className="w-6 h-6 text-[var(--accent)]" />}
          title="Alerty i zdarzenia bezpieczeństwa"
          description="Zdarzenia z różnych źródeł — Keycloak, dashboard IAM, manual security events. Wazuh dołączy jako kolejne źródło po deployu."
        />
        <div className="mt-4 flex gap-2">
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity | "")}
          >
            <option value="">Wszystkie severity</option>
            <option value="critical">Krytyczne</option>
            <option value="high">Wysokie</option>
            <option value="medium">Średnie</option>
            <option value="low">Niskie</option>
            <option value="info">Info</option>
          </select>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}

      {events.length === 0 && !loading && (
        <Card padding="lg">
          <div className="text-center py-8">
            <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold">Brak zdarzeń</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {severity
                ? `Nie ma zdarzeń o severity „${severity}". Spróbuj innego filtra.`
                : "System nie zarejestrował żadnych zdarzeń bezpieczeństwa. Pojawią się tu gdy: ktoś próbuje brute force KC login, plik mTLS zostanie zmodyfikowany, ktoś w panelu zablokuje IP, itp."}
            </p>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {events.map((ev) => (
          <Card
            key={ev.id}
            padding="md"
            className={
              ev.severity === "critical" || ev.severity === "high"
                ? "border-red-500/30 bg-red-500/5"
                : ""
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge tone={SEVERITY_TONE[ev.severity]}>
                    {SEVERITY_LABEL[ev.severity]}
                  </Badge>
                  <code className="text-[10px] text-[var(--text-muted)]">
                    {ev.category}
                  </code>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    · {ev.source}
                  </span>
                </div>
                <div className="text-sm font-medium">{ev.title}</div>
                {ev.description && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {ev.description}
                  </p>
                )}
                {(ev.srcIp || ev.targetUser) && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {ev.srcIp && (
                      <span>
                        IP: <code>{ev.srcIp}</code>
                      </span>
                    )}
                    {ev.targetUser && (
                      <span>
                        User: <code>{ev.targetUser}</code>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                {new Date(ev.ts).toLocaleString("pl-PL")}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Blocks ──────────────────────────────────────────────────────────────────

function BlocksPanel() {
  const [blocks, setBlocks] = useState<BlockedIp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newDuration, setNewDuration] = useState(60);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ blocks: BlockedIp[] }>(
        "/api/admin/security/blocks",
      );
      setBlocks(r.blocks);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function block() {
    if (!newIp.trim() || !newReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/admin/security/blocks", {
        ip: newIp.trim(),
        reason: newReason.trim(),
        durationMinutes: newDuration > 0 ? newDuration : undefined,
      });
      setNotice(`IP ${newIp} zablokowany.`);
      setNewIp("");
      setNewReason("");
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Block failed");
    } finally {
      setBusy(false);
    }
  }

  async function unblock(ip: string) {
    if (!confirm(`Odblokować IP ${ip}?`)) return;
    setBusy(true);
    try {
      await api.delete(
        `/api/admin/security/blocks?ip=${encodeURIComponent(ip)}`,
      );
      setNotice(`IP ${ip} odblokowany.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unblock failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader
          icon={<Ban className="w-6 h-6 text-[var(--accent)]" />}
          title="Zablokowane IP"
          description="Manualne blokady (z tego panelu) + przyszłe automatyczne (Wazuh Active Response). Każda blokada ma reason, optional expires_at — auto-unblock."
        />
        <div className="mt-4 flex gap-2">
          <Button onClick={() => setShowAdd(true)}>+ Zablokuj IP</Button>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {showAdd && (
        <Card padding="lg" className="border-[var(--accent)]/40">
          <h3 className="text-sm font-semibold mb-3">Nowa blokada IP</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <Input
              label="Adres IP"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              placeholder="194.12.5.18"
            />
            <Input
              label="Powód blokady"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Brute force KC login attempts"
            />
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">
                Czas blokady (auto-unblock po)
              </label>
              <select
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
              >
                <option value={60}>1 godzina</option>
                <option value={1440}>24 godziny</option>
                <option value={10080}>7 dni</option>
                <option value={43200}>30 dni</option>
                <option value={0}>Permanent (manual unblock only)</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              onClick={block}
              loading={busy}
              disabled={!newIp.trim() || !newReason.trim()}
            >
              Zablokuj
            </Button>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>
              Anuluj
            </Button>
          </div>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}

      {blocks.length === 0 && !loading && (
        <Card padding="lg">
          <div className="text-center py-8">
            <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold">Brak zablokowanych IP</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Po wdrożeniu Wazuh, brute force detection automatycznie zablokuje
              IP po 5+ failed logach w 5 min (timeout 1h, manual extension w
              tym panelu).
            </p>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {blocks.map((b) => (
          <Card key={b.ip} padding="md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-[var(--text-muted)]" />
                  <code className="font-mono text-sm">{b.ip}</code>
                  {b.country && (
                    <Badge tone="neutral">{b.country}</Badge>
                  )}
                  <Badge
                    tone={b.source === "manual" ? "neutral" : "warning"}
                  >
                    {b.source}
                  </Badge>
                  {b.expiresAt && (
                    <Badge tone="warning">
                      auto-unblock: {new Date(b.expiresAt).toLocaleString("pl-PL")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {b.reason}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Zablokowany {new Date(b.blockedAt).toLocaleString("pl-PL")}{" "}
                  przez {b.blockedBy}
                  {b.attempts > 1 && ` · ${b.attempts} prób`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => unblock(b.ip)}
                loading={busy}
              >
                Odblokuj
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Agents (placeholder dla Wazuh) ──────────────────────────────────────────

function AgentsPanel() {
  return (
    <div className="space-y-4">
      <Card padding="lg">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
          <div>
            <h3 className="text-base font-semibold">
              Wazuh SIEM jeszcze nie wdrożony
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Custom panel działa już teraz w trybie ograniczonym (manualne
              blokady, agregacja zdarzeń z dashboardu). Pełna funkcjonalność
              SIEM (FIM, vulnerabilities, real-time threat detection,
              auto-block) będzie dostępna po deployu Wazuh All-in-One.
            </p>
          </div>
        </div>
      </Card>

      <Card padding="md">
        <h4 className="text-sm font-semibold mb-2">Plan wdrożenia Wazuh</h4>
        <ol className="text-xs text-[var(--text-muted)] space-y-1.5 list-decimal list-inside">
          <li>
            Wkleić docker-compose Wazuh All-in-One do Coolify Resources →
            Docker Compose
          </li>
          <li>
            Skopiować passwords z <code>/etc/wazuh-secrets.env</code> (już
            wygenerowane na serwerze) do env w Coolify
          </li>
          <li>Deploy → Wazuh dostępny pod wazuh.myperformance.pl (mTLS)</li>
          <li>
            Install agent na hoście:{" "}
            <code>
              sudo WAZUH_MANAGER=&apos;wazuh.manager&apos; apt install wazuh-agent
            </code>
          </li>
          <li>
            Custom decoders dla Keycloak/Postal/Coolify wgrywane przez{" "}
            <code>/var/ossec/etc/decoders/local_*.xml</code>
          </li>
          <li>
            Active Response: skrypt block-ip-traefik.sh + reguły w manager
          </li>
        </ol>
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          Pełna instrukcja:{" "}
          <code>docs/plan_wazuh_siem.md</code> w repozytorium.
        </p>
      </Card>

      <Card padding="md">
        <h4 className="text-sm font-semibold mb-2">
          Co Wazuh doda po wdrożeniu
        </h4>
        <ul className="text-xs text-[var(--text-muted)] space-y-1 list-disc list-inside">
          <li>Auto-block IP po brute force detection (Active Response)</li>
          <li>File Integrity Monitoring na <code>/data/coolify</code> + critical configs</li>
          <li>Vulnerability detection (CVE matching) per agent</li>
          <li>MITRE ATT&amp;CK mapping</li>
          <li>Compliance reports (PCI-DSS, GDPR, NIST out of the box)</li>
          <li>
            Log aggregation z całego stacku (KC, Postal, Coolify, Documenso,
            Moodle, Outline, Chatwoot, dashboard)
          </li>
        </ul>
      </Card>
    </div>
  );
}
