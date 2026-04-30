"use client";

import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Link2Off,
  LinkIcon,
  MapPin,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui";
import type { ConfigOverviewStats } from "@/lib/config-overview";

/**
 * Top-of-page snapshot with 4 colored stat cards and a sync-status table.
 * Pure presentation — server-rendered stats are passed in.
 */
export function OverviewPanel({ stats }: { stats: ConfigOverviewStats }) {
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
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}
      >
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
