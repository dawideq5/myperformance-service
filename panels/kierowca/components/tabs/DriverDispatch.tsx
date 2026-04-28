"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  User,
} from "lucide-react";
import { DriverJobDialog } from "./DriverJobDialog";

export interface TransportJob {
  id: string;
  jobNumber: string;
  status: string;
  kind: string;
  serviceId: string | null;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  destinationAddress: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  assignedDriver: string | null;
  scheduledAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  recipientSignature: string | null;
  notes: string | null;
  createdAt: string | null;
}

interface PanelLocation {
  id: string;
  name: string;
  warehouseCode: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

const COLUMNS = [
  { status: "queued", label: "Dostępne", color: "#64748B" },
  { status: "assigned", label: "Moje", color: "#0EA5E9" },
  { status: "in_transit", label: "W drodze", color: "#A855F7" },
  { status: "delivered", label: "Dostarczone", color: "#22C55E" },
] as const;

const KIND_LABELS: Record<string, string> = {
  pickup_to_service: "Odbiór do serwisu",
  return_to_customer: "Zwrot do klienta",
  warehouse_transfer: "Między magazynami",
};

export function DriverDispatch({ userEmail }: { userEmail: string }) {
  const [jobs, setJobs] = useState<TransportJob[]>([]);
  const [locations, setLocations] = useState<PanelLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const jobsRes = await fetch(
        `/api/relay/transport-jobs?${onlyMine ? "scope=driver&" : ""}limit=200`,
      );
      const j1 = await jobsRes.json();
      const fetchedJobs: TransportJob[] = j1.jobs ?? [];
      setJobs(fetchedJobs);
      // Resolve location IDs referenced w jobs (source + destination).
      const locIds = Array.from(
        new Set(
          fetchedJobs
            .flatMap((j) => [j.sourceLocationId, j.destinationLocationId])
            .filter((x): x is string => !!x),
        ),
      );
      if (locIds.length > 0) {
        const locsRes = await fetch(
          `/api/relay/locations?ids=${locIds.join(",")}`,
        );
        const j2 = await locsRes.json();
        setLocations(j2.locations ?? []);
      } else {
        setLocations([]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [onlyMine]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const locById = useMemo(() => {
    const m = new Map<string, PanelLocation>();
    for (const l of locations) m.set(l.id, l);
    return m;
  }, [locations]);

  const byStatus = useMemo(() => {
    const m: Record<string, TransportJob[]> = {};
    for (const c of COLUMNS) m[c.status] = [];
    for (const j of jobs) {
      if (m[j.status]) m[j.status].push(j);
    }
    return m;
  }, [jobs]);

  const selected = selectedId
    ? jobs.find((j) => j.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer"
          style={{
            background: onlyMine ? "var(--accent)" : "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: onlyMine ? "#fff" : "var(--text-muted)",
          }}
        >
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="sr-only"
          />
          <User className="w-4 h-4" />
          <span className="text-xs font-medium">Tylko moje zlecenia</span>
        </label>
        <button
          type="button"
          onClick={() => void refresh()}
          className="p-2 rounded-lg border"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
          title="Odśwież"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2
            className="w-6 h-6 animate-spin"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className="p-2 rounded-2xl border"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
                minHeight: 200,
              }}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <span
                  className="text-[11px] uppercase font-semibold"
                  style={{ color: col.color }}
                >
                  {col.label}
                </span>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--bg-surface)",
                    color: "var(--text-muted)",
                  }}
                >
                  {byStatus[col.status]?.length ?? 0}
                </span>
              </div>
              <div className="space-y-2">
                {(byStatus[col.status] ?? []).map((j) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    onClick={() => setSelectedId(j.id)}
                    locById={locById}
                  />
                ))}
                {byStatus[col.status]?.length === 0 && (
                  <p
                    className="text-[10px] text-center py-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    —
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DriverJobDialog
          job={selected}
          locById={locById}
          userEmail={userEmail}
          onClose={() => setSelectedId(null)}
          onUpdated={() => void refresh()}
        />
      )}
    </div>
  );
}

function JobCard({
  job,
  onClick,
  locById,
}: {
  job: TransportJob;
  onClick: () => void;
  locById: Map<string, PanelLocation>;
}) {
  const source = job.sourceLocationId ? locById.get(job.sourceLocationId) : null;
  const dest = job.destinationLocationId
    ? locById.get(job.destinationLocationId)
    : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-2 rounded-lg border hover:opacity-90 transition"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-main)",
      }}
    >
      <div className="flex items-center gap-1 mb-1">
        <Package className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
        <span className="font-mono text-[10px] font-semibold">
          {job.jobNumber}
        </span>
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {KIND_LABELS[job.kind] ?? job.kind}
      </div>
      <div className="text-xs mt-1 flex items-start gap-1">
        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
        <span className="truncate">
          {dest?.name ?? job.destinationAddress ?? source?.name ?? "—"}
        </span>
      </div>
      {job.scheduledAt && (
        <div
          className="text-[10px] mt-1"
          style={{ color: "var(--text-muted)" }}
        >
          {new Date(job.scheduledAt).toLocaleString("pl", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}
    </button>
  );
}
