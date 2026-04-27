"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Briefcase,
  CheckCircle2,
  Edit2,
  ExternalLink,
  FileSignature,
  Layers,
  LinkIcon,
  Link2Off,
  MapPin,
  Plus,
  Settings,
  Tags,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  PageShell,
  Spinner,
  TabPanel,
  Tabs,
  Textarea,
  useToast,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import type { Location } from "@/lib/locations";
import type { CertLinkRow, ConfigOverviewStats } from "@/lib/config-overview";
import { CertLocationsDialog } from "../certificates/CertLocationsDialog";

type TabId = "overview" | "links" | "locations" | "targets" | "certs";

interface TargetGroupDTO {
  id: string;
  code: string;
  label: string;
  description: string | null;
  unit: string;
  externalCode: string | null;
  sort: number;
  enabled: boolean;
}

interface TargetThresholdDTO {
  id: string;
  groupId: string;
  label: string | null;
  fromValue: number;
  toValue: number | null;
  value: number;
  color: string | null;
  sort: number;
}

interface ConfigClientProps {
  stats: ConfigOverviewStats;
  links: CertLinkRow[];
  locations: Location[];
  userLabel?: string;
  userEmail?: string;
}

const TABS: TabDefinition<TabId>[] = [
  { id: "overview", label: "Przegląd", icon: <Layers className="w-4 h-4" /> },
  {
    id: "links",
    label: "Powiązania cert ↔ punkty",
    icon: <LinkIcon className="w-4 h-4" />,
  },
  {
    id: "locations",
    label: "Punkty",
    icon: <MapPin className="w-4 h-4" />,
  },
  {
    id: "targets",
    label: "Grupy targetowe",
    icon: <Tags className="w-4 h-4" />,
  },
  {
    id: "certs",
    label: "Certyfikaty",
    icon: <FileSignature className="w-4 h-4" />,
  },
];

export function ConfigClient({
  stats,
  links,
  locations,
  userLabel,
  userEmail,
}: ConfigClientProps) {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <PageShell
      maxWidth="2xl"
      header={
        <AppHeader
          userLabel={userLabel}
          userSubLabel={userEmail}
          backHref="/dashboard"
          title="Zarządzanie konfiguracją"
        />
      }
    >
      <div className="space-y-4">
        <Card padding="lg" className="bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-surface)]">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
              <Settings className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold mb-1">
                Centralne zarządzanie konfiguracją
              </h1>
              <p className="text-sm text-[var(--text-muted)] max-w-2xl">
                Punkty sprzedażowe i serwisowe, certyfikaty klienckie mTLS
                i powiązania między nimi w jednym miejscu. Zmiany odzwierciedlają
                się natychmiast w panelu sprzedawcy / serwisanta.
              </p>
            </div>
          </div>
        </Card>

        <Tabs<TabId>
          tabs={TABS}
          activeTab={tab}
          onChange={setTab}
          orientation="horizontal"
        />

        <TabPanel tabId="overview" active={tab === "overview"}>
          <OverviewTab stats={stats} />
        </TabPanel>

        <TabPanel tabId="links" active={tab === "links"}>
          <LinksTab links={links} />
        </TabPanel>

        <TabPanel tabId="locations" active={tab === "locations"}>
          <LocationsSummaryTab locations={locations} />
        </TabPanel>

        <TabPanel tabId="targets" active={tab === "targets"}>
          <TargetGroupsTab />
        </TabPanel>

        <TabPanel tabId="certs" active={tab === "certs"}>
          <CertsSummaryTab />
        </TabPanel>
      </div>
    </PageShell>
  );
}

// ── Tab: Przegląd ───────────────────────────────────────────────────────
function OverviewTab({ stats }: { stats: ConfigOverviewStats }) {
  const cards = [
    {
      title: "Punkty",
      value: stats.locations.total,
      detail: `${stats.locations.sales} sprzedaży · ${stats.locations.service} serwis`,
      icon: <MapPin className="w-5 h-5" />,
      color: "sky",
      cta: "/admin/locations",
      ctaLabel: "Zarządzaj punktami",
    },
    {
      title: "Aktywne certyfikaty",
      value: stats.certificates.active,
      detail:
        stats.certificates.expiringSoon > 0
          ? `${stats.certificates.expiringSoon} wygasa w 14 dni`
          : `${stats.certificates.revoked} unieważnionych`,
      icon: <FileSignature className="w-5 h-5" />,
      color: stats.certificates.expiringSoon > 0 ? "amber" : "emerald",
      cta: "/admin/certificates",
      ctaLabel: "Zarządzaj certyfikatami",
    },
    {
      title: "Powiązania",
      value: stats.assignments.totalLinks,
      detail: `${stats.assignments.certsWithLocations} certów z punktami`,
      icon: <LinkIcon className="w-5 h-5" />,
      color: "violet",
      cta: undefined,
      ctaLabel: "Edytuj w zakładce Powiązania",
    },
    {
      title: "Bez powiązania",
      value: stats.assignments.certsWithoutLocations,
      detail: `${stats.assignments.locationsWithoutCerts} punktów bez certu`,
      icon: <Link2Off className="w-5 h-5" />,
      color: stats.assignments.certsWithoutLocations > 0 ? "rose" : "neutral",
      cta: undefined,
      ctaLabel: "Sprawdź zakładkę Powiązania",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <StatCard key={c.title} {...c} />
        ))}
      </div>

      <Card padding="lg">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Stan synchronizacji
        </h3>
        <div className="space-y-2 text-sm">
          <Row
            label="Punkty z lokalizacją GPS"
            value={`${stats.locations.geocoded} / ${stats.locations.total}`}
            ok={stats.locations.geocoded === stats.locations.total}
          />
          <Row
            label="Punkty aktywne (enabled)"
            value={`${stats.locations.enabled} / ${stats.locations.total}`}
          />
          <Row
            label="Certyfikaty z przypisanymi punktami"
            value={`${stats.assignments.certsWithLocations} / ${stats.certificates.active}`}
            ok={
              stats.certificates.active === 0 ||
              stats.assignments.certsWithLocations === stats.certificates.active
            }
          />
          <Row
            label="Punkty z przypisanymi certami"
            value={`${stats.assignments.locationsWithCerts} / ${stats.locations.enabled}`}
          />
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  detail,
  icon,
  color,
  cta,
  ctaLabel,
}: {
  title: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  color: string;
  cta?: string;
  ctaLabel: string;
}) {
  const colorClass: Record<string, string> = {
    sky: "bg-sky-500/10 text-sky-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
    violet: "bg-violet-500/10 text-violet-400",
    rose: "bg-rose-500/10 text-rose-400",
    neutral: "bg-[var(--bg-surface)] text-[var(--text-muted)]",
  };
  const cls = colorClass[color] ?? colorClass.neutral;
  const inner = (
    <div className="flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-0.5">
          {title}
        </p>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
          {detail}
        </p>
      </div>
    </div>
  );
  if (cta) {
    return (
      <Link
        href={cta}
        className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 transition block"
      >
        {inner}
        <span className="text-[11px] text-[var(--accent)] mt-2 inline-flex items-center gap-1">
          {ctaLabel} <ExternalLink className="w-3 h-3" />
        </span>
      </Link>
    );
  }
  return (
    <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
      {inner}
      <span className="text-[11px] text-[var(--text-muted)] mt-2 block">
        {ctaLabel}
      </span>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="p-3 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 hover:bg-[var(--bg-surface)] transition flex items-start gap-2.5"
    >
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-[var(--text-muted)] truncate">{subtitle}</p>
      </div>
    </Link>
  );
}

function Row({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)]/50 last:border-b-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono text-xs flex items-center gap-1.5">
        {ok === true && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
        {ok === false && <XCircle className="w-3 h-3 text-amber-400" />}
        {value}
      </span>
    </div>
  );
}

// ── Tab: Powiązania ─────────────────────────────────────────────────────
function LinksTab({ links }: { links: CertLinkRow[] }) {
  const [editingCert, setEditingCert] = useState<CertLinkRow | null>(null);
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");

  const filtered = useMemo(() => {
    return links.filter((l) => {
      if (l.revoked) return false;
      if (filter === "linked") return l.locations.length > 0;
      if (filter === "unlinked") return l.locations.length === 0;
      return true;
    });
  }, [links, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            filter === "all"
              ? "bg-[var(--accent)]/10 text-[var(--accent)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
          }`}
        >
          Wszystkie ({links.filter((l) => !l.revoked).length})
        </button>
        <button
          onClick={() => setFilter("linked")}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            filter === "linked"
              ? "bg-emerald-500/10 text-emerald-400"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
          }`}
        >
          Z powiązaniami ({links.filter((l) => !l.revoked && l.locations.length > 0).length})
        </button>
        <button
          onClick={() => setFilter("unlinked")}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            filter === "unlinked"
              ? "bg-rose-500/10 text-rose-400"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
          }`}
        >
          Bez powiązań ({links.filter((l) => !l.revoked && l.locations.length === 0).length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <Card padding="lg">
          <p className="text-center text-sm text-[var(--text-muted)] py-6">
            Brak certyfikatów spełniających filtr.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <div
              key={row.certId}
              className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <FileSignature className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                    <span className="font-semibold truncate">{row.certSubject}</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] flex flex-wrap gap-3">
                    {row.certEmail && <span>{row.certEmail}</span>}
                    {row.certRoles.map((r) => (
                      <Badge key={r} tone="neutral">{r}</Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<LinkIcon className="w-3.5 h-3.5" />}
                  onClick={() => setEditingCert(row)}
                >
                  {row.locations.length === 0 ? "Powiąż punkty" : "Edytuj"}
                </Button>
              </div>
              {row.locations.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/5 rounded-lg p-2.5">
                  <Link2Off className="w-3.5 h-3.5" />
                  Brak przypisanych punktów. User z tym cert dostanie &bdquo;Brak przypisanych punktów&rdquo; przy logowaniu do panelu.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {row.locations.map((l) => (
                    <span
                      key={l.id}
                      className="text-xs px-2 py-1 rounded bg-[var(--bg-surface)] flex items-center gap-1.5"
                    >
                      {l.type === "service" ? (
                        <Wrench className="w-3 h-3 text-rose-400" />
                      ) : (
                        <Briefcase className="w-3 h-3 text-sky-400" />
                      )}
                      {l.name}
                      {l.warehouseCode && (
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          {l.warehouseCode}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editingCert && (
        <CertLocationsDialog
          open
          certId={editingCert.certId}
          certSubject={editingCert.certSubject}
          certRoles={editingCert.certRoles}
          onClose={() => {
            setEditingCert(null);
            // Force refresh — najprościej window.location.reload
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

// ── Tab: Punkty (summary) ───────────────────────────────────────────────
function LocationsSummaryTab({ locations }: { locations: Location[] }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/admin/locations"
          className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
        >
          Pełne zarządzanie w /admin/locations <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      {locations.length === 0 ? (
        <Card padding="lg">
          <p className="text-center text-sm text-[var(--text-muted)] py-6">
            Brak punktów. Dodaj pierwsze w{" "}
            <Link href="/admin/locations" className="text-[var(--accent)] underline">
              /admin/locations
            </Link>
            .
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map((l) => (
            <Link
              href="/admin/locations"
              key={l.id}
              className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 transition block"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {l.type === "service" ? (
                    <Wrench className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  ) : (
                    <Briefcase className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  )}
                  <span className="text-sm font-semibold truncate">{l.name}</span>
                </div>
                {!l.enabled && <Badge tone="neutral">Wył.</Badge>}
              </div>
              {l.warehouseCode && (
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-mono mb-1">
                  {l.warehouseCode}
                </div>
              )}
              {l.address && (
                <div className="text-xs text-[var(--text-muted)] truncate">{l.address}</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Grupy targetowe ───────────────────────────────────────────────
// CRUD nad mp_target_groups + mp_target_thresholds. Każda grupa to
// kategoria produktów/usług dla planów punktów (uchwyty, gwarancje, etc.).
// Per-grupa: dowolna liczba progów [from, to] → wartość. Używane w panelach
// sprzedawca/serwisant do liczenia punktów lojalnościowych / prowizji.
function TargetGroupsTab() {
  const toast = useToast();
  const [groups, setGroups] = useState<TargetGroupDTO[]>([]);
  const [thresholdsByGroup, setThresholdsByGroup] = useState<
    Record<string, TargetThresholdDTO[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TargetGroupDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [thresholdsFor, setThresholdsFor] = useState<TargetGroupDTO | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/target-groups");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      setGroups(json.data?.groups ?? []);
      setThresholdsByGroup(json.data?.thresholdsByGroup ?? {});
    } catch (err) {
      toast.error(
        "Błąd",
        err instanceof Error ? err.message : "Nie udało się pobrać grup",
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDelete = useCallback(
    async (g: TargetGroupDTO) => {
      if (!confirm(`Usunąć grupę "${g.label}" wraz ze wszystkimi progami?`))
        return;
      try {
        const res = await fetch(`/api/admin/target-groups/${g.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
        }
        toast.success("Grupa usunięta");
        void refresh();
      } catch (err) {
        toast.error(
          "Błąd",
          err instanceof Error ? err.message : "Nie udało się usunąć",
        );
      }
    },
    [refresh, toast],
  );

  if (loading) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">
          Kategorie produktów i usług dla planów punktów. Każda grupa ma własne
          progi (od X do Y → wartość).
        </p>
        <Button
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setCreating(true)}
        >
          Dodaj grupę
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card padding="lg">
          <p className="text-center text-sm text-[var(--text-muted)] py-6">
            Brak grup targetowych. Dodaj pierwszą — domyślnie zaseedowane jest 8
            grup, jeśli ich nie widzisz, sprawdź połączenie z Directusem.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((g) => {
            const ts = thresholdsByGroup[g.id] ?? [];
            return (
              <Card key={g.id} padding="md">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold truncate">{g.label}</span>
                      {!g.enabled && <Badge tone="neutral">Wył.</Badge>}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono">
                      {g.code} · jednostka: {g.unit}
                      {g.externalCode ? ` · ERP: ${g.externalCode}` : ""}
                    </div>
                    {g.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                        {g.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(g)}
                      className="p-1.5 rounded hover:bg-[var(--bg-surface)] transition"
                      aria-label="Edytuj"
                      title="Edytuj"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(g)}
                      className="p-1.5 rounded hover:bg-rose-500/10 text-rose-400 transition"
                      aria-label="Usuń"
                      title="Usuń"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="border-t border-[var(--border-subtle)] pt-2 mt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                      Progi ({ts.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setThresholdsFor(g)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Zarządzaj progami →
                    </button>
                  </div>
                  {ts.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      Brak progów.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {ts.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between text-xs gap-2"
                        >
                          <span className="text-[var(--text-muted)] truncate">
                            {t.label ??
                              `${t.fromValue}–${t.toValue ?? "∞"} ${g.unit}`}
                          </span>
                          <span className="font-mono">{t.value}</span>
                        </div>
                      ))}
                      {ts.length > 3 && (
                        <p className="text-[10px] text-[var(--text-muted)]">
                          +{ts.length - 3} więcej
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(editing || creating) && (
        <TargetGroupDialog
          group={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void refresh();
          }}
        />
      )}

      {thresholdsFor && (
        <ThresholdsDialog
          group={thresholdsFor}
          thresholds={thresholdsByGroup[thresholdsFor.id] ?? []}
          onClose={() => setThresholdsFor(null)}
          onChanged={() => void refresh()}
        />
      )}
    </div>
  );
}

function TargetGroupDialog({
  group,
  onClose,
  onSaved,
}: {
  group: TargetGroupDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState(group?.code ?? "");
  const [label, setLabel] = useState(group?.label ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [unit, setUnit] = useState(group?.unit ?? "szt");
  const [externalCode, setExternalCode] = useState(group?.externalCode ?? "");
  const [sort, setSort] = useState(String(group?.sort ?? 0));
  const [enabled, setEnabled] = useState(group?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        code: code.trim().toUpperCase(),
        label: label.trim(),
        description: description.trim() || null,
        unit: unit.trim() || "szt",
        externalCode: externalCode.trim() || null,
        sort: Number(sort) || 0,
        enabled,
      };
      const url = group
        ? `/api/admin/target-groups/${group.id}`
        : `/api/admin/target-groups`;
      const res = await fetch(url, {
        method: group ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      toast.success(group ? "Grupa zaktualizowana" : "Grupa utworzona");
      onSaved();
    } catch (err) {
      toast.error(
        "Błąd",
        err instanceof Error ? err.message : "Zapis nieudany",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={group ? `Edycja: ${group.label}` : "Nowa grupa targetowa"}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Kod"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="np. UCH_SAM"
            required
            disabled={!!group}
            hint="A-Z 0-9 _ (2-32 znaki). Niezmienny po utworzeniu."
          />
          <Input
            label="Nazwa"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="np. Uchwyty samochodowe"
            required
          />
        </div>
        <Textarea
          label="Opis"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">
              Jednostka
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="szt">Sztuki (szt)</option>
              <option value="PLN">Złote (PLN)</option>
              <option value="kpl">Komplety (kpl)</option>
              <option value="h">Godziny (h)</option>
              <option value="other">Inne</option>
            </select>
          </div>
          <Input
            label="Sortowanie"
            type="number"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            min={0}
            max={999}
          />
        </div>
        <Input
          label="Kod ERP (opcjonalnie)"
          value={externalCode}
          onChange={(e) => setExternalCode(e.target.value)}
          placeholder="Mapping do zewnętrznego systemu"
        />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">Grupa aktywna (widoczna w panelach)</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="submit" loading={saving}>
            {group ? "Zapisz" : "Utwórz"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ThresholdsDialog({
  group,
  thresholds,
  onClose,
  onChanged,
}: {
  group: TargetGroupDTO;
  thresholds: TargetThresholdDTO[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<TargetThresholdDTO[]>(thresholds);
  const [saving, setSaving] = useState(false);

  useEffect(() => setItems(thresholds), [thresholds]);

  const addRow = () => {
    setItems([
      ...items,
      {
        id: `new-${Date.now()}`,
        groupId: group.id,
        label: "",
        fromValue: items.length > 0 ? Math.max(...items.map((t) => t.toValue ?? t.fromValue)) + 1 : 0,
        toValue: null,
        value: 0,
        color: null,
        sort: items.length,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<TargetThresholdDTO>) => {
    setItems(items.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const removeRow = async (t: TargetThresholdDTO, idx: number) => {
    if (t.id.startsWith("new-")) {
      setItems(items.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm("Usunąć ten próg?")) return;
    try {
      const res = await fetch(
        `/api/admin/target-groups/${group.id}/thresholds/${t.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setItems(items.filter((_, i) => i !== idx));
      onChanged();
    } catch (err) {
      toast.error(
        "Błąd",
        err instanceof Error ? err.message : "Usuwanie nieudane",
      );
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Save kolejno — POST dla nowych, PATCH dla istniejących.
      for (const t of items) {
        const isNew = t.id.startsWith("new-");
        const body = {
          label: t.label ?? null,
          fromValue: t.fromValue,
          toValue: t.toValue,
          value: t.value,
          color: t.color ?? null,
          sort: t.sort,
        };
        const url = isNew
          ? `/api/admin/target-groups/${group.id}/thresholds`
          : `/api/admin/target-groups/${group.id}/thresholds/${t.id}`;
        const res = await fetch(url, {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
        }
      }
      toast.success("Progi zapisane");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(
        "Błąd",
        err instanceof Error ? err.message : "Zapis nieudany",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Progi grupy: ${group.label}`}
      size="lg"
    >
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Każdy próg to range [od, do] z przypisaną wartością (np. cena za szt,
          punkty lojalnościowe, prowizja). Pole „do&rdquo; puste = bez górnego limitu.
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] px-1">
            <div className="col-span-3">Nazwa progu</div>
            <div className="col-span-2">Od</div>
            <div className="col-span-2">Do</div>
            <div className="col-span-2">Wartość</div>
            <div className="col-span-2">Kolor</div>
            <div className="col-span-1"></div>
          </div>
          {items.map((t, idx) => (
            <div
              key={t.id}
              className="grid grid-cols-12 gap-2 items-center"
            >
              <input
                value={t.label ?? ""}
                onChange={(e) => updateRow(idx, { label: e.target.value })}
                placeholder="Niski / Średni / Wysoki"
                className="col-span-3 px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
              />
              <input
                type="number"
                value={t.fromValue}
                onChange={(e) =>
                  updateRow(idx, { fromValue: Number(e.target.value) || 0 })
                }
                className="col-span-2 px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
              />
              <input
                type="number"
                value={t.toValue ?? ""}
                onChange={(e) =>
                  updateRow(idx, {
                    toValue: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="∞"
                className="col-span-2 px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
              />
              <input
                type="number"
                value={t.value}
                onChange={(e) =>
                  updateRow(idx, { value: Number(e.target.value) || 0 })
                }
                className="col-span-2 px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
              />
              <input
                type="color"
                value={t.color ?? "#3b82f6"}
                onChange={(e) => updateRow(idx, { color: e.target.value })}
                className="col-span-2 w-full h-9 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer"
              />
              <button
                type="button"
                onClick={() => void removeRow(t, idx)}
                className="col-span-1 p-1.5 rounded hover:bg-rose-500/10 text-rose-400 transition flex items-center justify-center"
                aria-label="Usuń próg"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-center text-sm text-[var(--text-muted)] py-4">
              Brak progów. Dodaj pierwszy.
            </p>
          )}
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-[var(--border-subtle)]">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={addRow}
          >
            Dodaj próg
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Anuluj
            </Button>
            <Button onClick={saveAll} loading={saving}>
              Zapisz wszystko
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ── Tab: Certyfikaty (summary) ──────────────────────────────────────────
function CertsSummaryTab() {
  return (
    <Card padding="lg">
      <div className="text-center py-6 space-y-3">
        <FileSignature className="w-12 h-12 text-[var(--accent)] mx-auto opacity-60" />
        <h3 className="text-base font-semibold">
          Pełna konsola certyfikatów
        </h3>
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
          Wystawianie, unieważnianie, audit-trail, device binding, root CA —
          dedykowana strona z pełnymi narzędziami.
        </p>
        <Link
          href="/admin/certificates"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 transition"
        >
          Otwórz konsolę certyfikatów
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </Card>
  );
}
