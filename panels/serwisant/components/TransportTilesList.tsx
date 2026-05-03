"use client";

import { ChevronRight, MapPin, Truck } from "lucide-react";
import type { TransportJobDetail, TransportLocationLookup } from "./TransportDetailsDrawer";

/**
 * Wave 22 / F10 — Transport tiles list.
 *
 * Render listy zleceń transportu jako klikalnych kafelków. Każdy kafelek:
 *  - status badge (color-coded wg STATUS_LABELS),
 *  - jobNumber + kind label,
 *  - kierunek (source → destination z lookup names albo destinationAddress),
 *  - data utworzenia (relative).
 *
 * Onclick: parent (NaprawaTab) otwiera TransportDetailsDrawer ze szczegółami
 * (read-only z perspektywy serwisanta).
 *
 * Sortowanie: aktywne (queued/assigned/in_transit) najpierw, potem delivered,
 * na końcu cancelled. W każdej grupie najnowsze pierwsze (createdAt desc).
 */

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  queued: { label: "W kolejce", color: "#F59E0B" },
  assigned: { label: "Przypisany", color: "#0EA5E9" },
  in_transit: { label: "W drodze", color: "#A855F7" },
  delivered: { label: "Dostarczone", color: "#22C55E" },
  cancelled: { label: "Anulowane", color: "#64748B" },
};

const KIND_LABELS: Record<string, string> = {
  pickup_to_service: "Odbiór do serwisu",
  return_to_customer: "Zwrot do klienta",
  warehouse_transfer: "Między magazynami",
};

const STATUS_PRIORITY: Record<string, number> = {
  in_transit: 0,
  assigned: 1,
  queued: 2,
  delivered: 3,
  cancelled: 4,
};

function sortJobs(jobs: TransportJobDetail[]): TransportJobDetail[] {
  return [...jobs].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "przed chwilą";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min temu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} godz. temu`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} d. temu`;
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TransportTilesList({
  jobs,
  locationsById,
  onSelect,
}: {
  jobs: TransportJobDetail[];
  locationsById: Record<string, TransportLocationLookup>;
  onSelect: (job: TransportJobDetail) => void;
}) {
  if (jobs.length === 0) return null;
  const sorted = sortJobs(jobs);
  return (
    <ul
      className="space-y-1.5"
      role="list"
      aria-label="Lista zleceń transportu"
    >
      {sorted.map((job) => (
        <TransportTile
          key={job.id}
          job={job}
          locationsById={locationsById}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function TransportTile({
  job,
  locationsById,
  onSelect,
}: {
  job: TransportJobDetail;
  locationsById: Record<string, TransportLocationLookup>;
  onSelect: (job: TransportJobDetail) => void;
}) {
  const statusMeta = STATUS_LABELS[job.status] ?? {
    label: job.status,
    color: "#64748B",
  };
  const kindLabel = KIND_LABELS[job.kind] ?? job.kind;
  const sourceName = job.sourceLocationId
    ? locationsById[job.sourceLocationId]?.name ?? null
    : null;
  const destName = job.destinationLocationId
    ? locationsById[job.destinationLocationId]?.name ?? null
    : null;
  const directionLabel =
    [sourceName ?? "—", destName ?? job.destinationAddress ?? "—"].join(" → ");

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(job)}
        className="w-full text-left p-2.5 rounded-xl border transition-all hover:scale-[1.005] focus:outline-none focus:ring-2"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
        aria-label={`Otwórz szczegóły transportu ${job.jobNumber}, status ${statusMeta.label}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <Truck
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: statusMeta.color }}
            aria-hidden="true"
          />
          <span
            className="font-mono text-[11px] font-bold"
            style={{ color: "var(--text-main)" }}
          >
            {job.jobNumber}
          </span>
          <span
            className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded"
            style={{
              background: statusMeta.color + "22",
              color: statusMeta.color,
            }}
          >
            {statusMeta.label}
          </span>
          <span
            className="text-[10px] ml-auto"
            style={{ color: "var(--text-muted)" }}
          >
            {formatRelative(job.createdAt)}
          </span>
          <ChevronRight
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
        </div>
        <div
          className="text-[11px] flex items-start gap-1"
          style={{ color: "var(--text-main)" }}
        >
          <MapPin
            className="w-3 h-3 mt-0.5 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <span className="truncate">{directionLabel}</span>
        </div>
        <p
          className="text-[10px] mt-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          {kindLabel}
          {job.assignedDriver ? ` · ${job.assignedDriver}` : ""}
        </p>
      </button>
    </li>
  );
}
