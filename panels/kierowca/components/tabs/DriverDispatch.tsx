"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { subscribeToUser } from "@/lib/sse-client";
import {
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Route,
  Sparkles,
} from "lucide-react";
import { DriverJobDialog } from "./DriverJobDialog";
import { DriverMap, type MapJob } from "../DriverMap";

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

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  queued: { label: "W kolejce", color: "#F59E0B" },
  assigned: { label: "Przypisane", color: "#0EA5E9" },
  in_transit: { label: "W drodze", color: "#A855F7" },
  delivered: { label: "Dostarczone", color: "#22C55E" },
  cancelled: { label: "Anulowane", color: "#64748B" },
};

const KIND_LABELS: Record<string, string> = {
  pickup_to_service: "Odbiór do serwisu",
  return_to_customer: "Zwrot do klienta",
  warehouse_transfer: "Między magazynami",
};

/** Haversine — odległość km między dwoma punktami GPS. */
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Nearest-neighbor TSP: greedy heurystyka. Bardzo proste auto-planowanie
 * trasy — start od pierwszej pozycji, dla każdego kolejnego wybierz
 * najbliższy nieodwiedzony source point. */
function nearestNeighborRoute(jobs: MapJob[]): string[] {
  const withPos = jobs.filter((j) => j.source);
  if (withPos.length <= 1) return withPos.map((j) => j.id);
  const remaining = new Map(withPos.map((j) => [j.id, j]));
  const order: string[] = [];
  let cur = withPos[0];
  order.push(cur.id);
  remaining.delete(cur.id);
  while (remaining.size > 0) {
    let best: MapJob | null = null;
    let bestDist = Infinity;
    for (const j of remaining.values()) {
      if (!j.source || !cur.source) continue;
      const d = distanceKm(cur.source, j.source);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (!best) break;
    order.push(best.id);
    remaining.delete(best.id);
    cur = best;
  }
  return order;
}

export function DriverDispatch({ userEmail }: { userEmail: string }) {
  const [jobs, setJobs] = useState<TransportJob[]>([]);
  const [locations, setLocations] = useState<PanelLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogId, setDialogId] = useState<string | null>(null);
  const [autoRoute, setAutoRoute] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Pobieramy WSZYSTKIE zlecenia (bez filtra scope=driver) — kierowca
      // widzi i swoje i wolne, podejmuje decyzje na podstawie mapy.
      const jobsRes = await fetch(`/api/relay/transport-jobs?limit=500`);
      const j1 = await jobsRes.json();
      const fetchedJobs: TransportJob[] = j1.jobs ?? [];
      setJobs(fetchedJobs);
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Real-time SSE — user-scoped notyfikacje (transport_job_created/updated dla
  // kierowcy gdy serwisant zamawia transport). Refetch listy żeby zobaczyć
  // nowy job natychmiast bez F5.
  useEffect(() => {
    if (!userEmail) return;
    const unsub = subscribeToUser(userEmail, (evt) => {
      if (
        evt.type === "transport_job_created" ||
        evt.type === "transport_job_updated"
      ) {
        void refresh();
      }
    });
    return unsub;
  }, [userEmail, refresh]);

  const locById = useMemo(() => {
    const m = new Map<string, PanelLocation>();
    for (const l of locations) m.set(l.id, l);
    return m;
  }, [locations]);

  const filteredJobs = useMemo(() => {
    if (filter === "all") return jobs;
    return jobs.filter((j) => j.status !== "delivered" && j.status !== "cancelled");
  }, [jobs, filter]);

  const mapJobs = useMemo<MapJob[]>(() => {
    return filteredJobs.map((j) => {
      const src = j.sourceLocationId ? locById.get(j.sourceLocationId) : null;
      const dst = j.destinationLocationId
        ? locById.get(j.destinationLocationId)
        : null;
      return {
        id: j.id,
        jobNumber: j.jobNumber,
        status: j.status,
        kind: j.kind,
        source:
          src && src.lat != null && src.lng != null
            ? { lat: src.lat, lng: src.lng, name: src.name }
            : null,
        dest:
          dst && dst.lat != null && dst.lng != null
            ? { lat: dst.lat, lng: dst.lng, name: dst.name }
            : j.destinationLat != null && j.destinationLng != null
              ? {
                  lat: j.destinationLat,
                  lng: j.destinationLng,
                  name: j.destinationAddress ?? "Adres",
                }
              : null,
      };
    });
  }, [filteredJobs, locById]);

  const routeOrder = useMemo(() => {
    if (!autoRoute) return undefined;
    const active = mapJobs.filter(
      (j) => j.source && (j.status === "queued" || j.status === "assigned"),
    );
    return nearestNeighborRoute(active);
  }, [autoRoute, mapJobs]);

  const selected = selectedId
    ? jobs.find((j) => j.id === selectedId) ?? null
    : null;
  const dialog = dialogId
    ? jobs.find((j) => j.id === dialogId) ?? null
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {(["active", "all"] as const).map((opt) => {
            const active = filter === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setFilter(opt)}
                className="px-3 py-2 text-xs font-medium transition-all"
                style={{
                  background: active ? "var(--accent)" : "var(--bg-surface)",
                  color: active ? "#fff" : "var(--text-muted)",
                }}
              >
                {opt === "active" ? "Aktywne" : "Wszystkie"}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setAutoRoute((v) => !v)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all"
          style={{
            background: autoRoute
              ? "linear-gradient(135deg, #22C55E, #16A34A)"
              : "var(--bg-surface)",
            borderColor: autoRoute
              ? "rgba(34,197,94,0.5)"
              : "var(--border-subtle)",
            color: autoRoute ? "#fff" : "var(--text-muted)",
          }}
          title="Wyznacz optymalną trasę po wszystkich aktywnych zleceniach"
        >
          <Sparkles className="w-4 h-4" />
          Auto-planowanie
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          className="p-2 rounded-xl border"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
          title="Odśwież"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <span
          className="text-[11px] ml-auto"
          style={{ color: "var(--text-muted)" }}
        >
          {filteredJobs.length} zleceń
          {autoRoute && routeOrder && ` · trasa: ${routeOrder.length}`}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
        <DriverMap
          jobs={mapJobs}
          selectedId={selectedId}
          onSelect={setSelectedId}
          routeOrder={routeOrder}
          className="min-h-[480px] lg:min-h-[640px]"
        />
        <aside
          className="rounded-2xl border overflow-hidden flex flex-col"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
            maxHeight: 640,
          }}
        >
          <header
            className="px-3 py-2 border-b text-xs uppercase font-semibold flex items-center gap-2"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            <Route className="w-3.5 h-3.5" />
            Lista zleceń
          </header>
          {loading && jobs.length === 0 ? (
            <SkeletonList />
          ) : filteredJobs.length === 0 ? (
            <p
              className="text-sm text-center py-8 px-3"
              style={{ color: "var(--text-muted)" }}
            >
              Brak zleceń.
            </p>
          ) : (
            <ul className="overflow-y-auto flex-1 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {(routeOrder
                ? routeOrder
                    .map((id) => filteredJobs.find((j) => j.id === id))
                    .filter((x): x is TransportJob => !!x)
                    .concat(
                      filteredJobs.filter(
                        (j) => !routeOrder.includes(j.id),
                      ),
                    )
                : filteredJobs
              ).map((j, i) => (
                <JobRow
                  key={j.id}
                  job={j}
                  index={routeOrder?.includes(j.id) ? i + 1 : undefined}
                  selected={j.id === selectedId}
                  locById={locById}
                  onSelect={() => setSelectedId(j.id)}
                  onOpen={() => setDialogId(j.id)}
                  isAssignedToMe={j.assignedDriver === userEmail}
                />
              ))}
            </ul>
          )}
        </aside>
      </div>

      {selected && (
        <SelectedJobPanel
          job={selected}
          locById={locById}
          onOpenDialog={() => setDialogId(selected.id)}
        />
      )}

      {dialog && (
        <DriverJobDialog
          job={dialog}
          locById={locById}
          userEmail={userEmail}
          onClose={() => setDialogId(null)}
          onUpdated={() => void refresh()}
        />
      )}
    </div>
  );
}

function JobRow({
  job,
  index,
  selected,
  locById,
  onSelect,
  onOpen,
  isAssignedToMe,
}: {
  job: TransportJob;
  index?: number;
  selected: boolean;
  locById: Map<string, PanelLocation>;
  onSelect: () => void;
  onOpen: () => void;
  isAssignedToMe: boolean;
}) {
  const meta = STATUS_LABEL[job.status] ?? {
    label: job.status,
    color: "#64748B",
  };
  const src = job.sourceLocationId ? locById.get(job.sourceLocationId) : null;
  const dst = job.destinationLocationId
    ? locById.get(job.destinationLocationId)
    : null;
  return (
    <li
      onClick={onSelect}
      onDoubleClick={onOpen}
      className="px-3 py-2.5 cursor-pointer transition-colors"
      style={{
        background: selected ? "var(--accent-soft, rgba(99,102,241,0.1))" : undefined,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {index != null && (
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              background: "linear-gradient(135deg,#22C55E,#16A34A)",
              color: "#fff",
            }}
          >
            {index}
          </span>
        )}
        <Package className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
        <span
          className="font-mono text-[11px] font-bold"
          style={{ color: "var(--text-main)" }}
        >
          {job.jobNumber}
        </span>
        <span
          className="ml-auto text-[10px] uppercase font-bold px-1.5 py-0.5 rounded"
          style={{ background: meta.color + "22", color: meta.color }}
        >
          {meta.label}
        </span>
      </div>
      <p
        className="text-[11px] mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {KIND_LABELS[job.kind] ?? job.kind}
        {isAssignedToMe && (
          <span
            className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold"
            style={{ background: "rgba(14,165,233,0.18)", color: "#0EA5E9" }}
          >
            Moje
          </span>
        )}
      </p>
      <div
        className="text-[11px] flex items-start gap-1"
        style={{ color: "var(--text-main)" }}
      >
        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span className="truncate">
          {src?.name ?? "—"} → {dst?.name ?? job.destinationAddress ?? "—"}
        </span>
      </div>
      {job.scheduledAt && (
        <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
          {new Date(job.scheduledAt).toLocaleString("pl", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </li>
  );
}

function SelectedJobPanel({
  job,
  locById,
  onOpenDialog,
}: {
  job: TransportJob;
  locById: Map<string, PanelLocation>;
  onOpenDialog: () => void;
}) {
  const meta = STATUS_LABEL[job.status] ?? {
    label: job.status,
    color: "#64748B",
  };
  const src = job.sourceLocationId ? locById.get(job.sourceLocationId) : null;
  const dst = job.destinationLocationId
    ? locById.get(job.destinationLocationId)
    : null;
  return (
    <div
      className="rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
      style={{
        background: "var(--bg-card)",
        borderColor: meta.color + "55",
      }}
    >
      <div>
        <p
          className="text-[10px] uppercase font-bold tracking-wider mb-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          Zlecenie
        </p>
        <p
          className="font-mono text-sm font-bold"
          style={{ color: "var(--text-main)" }}
        >
          {job.jobNumber}
        </p>
        <p
          className="text-[11px] mt-1"
          style={{ color: meta.color }}
        >
          {meta.label} · {KIND_LABELS[job.kind] ?? job.kind}
        </p>
      </div>
      <div>
        <p
          className="text-[10px] uppercase font-bold tracking-wider mb-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          Skąd
        </p>
        <p className="text-sm" style={{ color: "var(--text-main)" }}>
          {src?.name ?? "—"}
        </p>
        {src?.address && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {src.address}
          </p>
        )}
        {src?.phone && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            tel. {src.phone}
          </p>
        )}
      </div>
      <div>
        <p
          className="text-[10px] uppercase font-bold tracking-wider mb-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          Dokąd
        </p>
        <p className="text-sm" style={{ color: "var(--text-main)" }}>
          {dst?.name ?? job.destinationAddress ?? "—"}
        </p>
        {dst?.address && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {dst.address}
          </p>
        )}
        {dst?.phone && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            tel. {dst.phone}
          </p>
        )}
      </div>
      {job.notes && (
        <div className="md:col-span-3">
          <p
            className="text-[10px] uppercase font-bold tracking-wider mb-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            Uwagi
          </p>
          <p className="text-xs" style={{ color: "var(--text-main)" }}>
            {job.notes}
          </p>
        </div>
      )}
      <div className="md:col-span-3 flex justify-end">
        <button
          type="button"
          onClick={onOpenDialog}
          className="px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #6366f1, #14b8a6)",
            color: "#fff",
          }}
        >
          Otwórz szczegóły
        </button>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="p-3 space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg animate-pulse"
          style={{
            background: "var(--bg-surface)",
            height: 64,
          }}
        />
      ))}
      <div
        className="flex items-center justify-center text-[10px] mt-2"
        style={{ color: "var(--text-muted)" }}
      >
        <Loader2 className="w-3 h-3 animate-spin mr-1" />
        Ładowanie zleceń…
      </div>
    </div>
  );
}
