"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Briefcase,
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Layers,
  LinkIcon,
  Link2Off,
  MapPin,
  Plus,
  Settings,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  PageShell,
  TabPanel,
  Tabs,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { LocationMap } from "@/components/LocationMap";
import type { Location } from "@/lib/locations";
import type { CertLinkRow, ConfigOverviewStats } from "@/lib/config-overview";
import { CertLocationsDialog } from "../certificates/CertLocationsDialog";

type TabId = "overview" | "links" | "locations" | "certs";

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
      {locations.length > 0 ? (
        <div style={{ height: 360 }}>
          <LocationMap locations={locations} className="h-full" />
        </div>
      ) : null}
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
