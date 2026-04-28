"use client";

import { useEffect, useState } from "react";
import { Loader2, Package, Truck } from "lucide-react";

interface TransportJob {
  id: string;
  jobNumber: string;
  status: string;
  kind: string;
  destinationAddress: string | null;
  assignedDriver: string | null;
  scheduledAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  queued: { label: "W kolejce", color: "#64748B" },
  assigned: { label: "Przypisany", color: "#0EA5E9" },
  in_transit: { label: "W drodze", color: "#A855F7" },
  delivered: { label: "Dostarczony", color: "#22C55E" },
  cancelled: { label: "Anulowany", color: "#EF4444" },
};

const KIND_LABELS: Record<string, string> = {
  pickup_to_service: "Odbiór do serwisu",
  return_to_customer: "Zwrot do klienta",
  warehouse_transfer: "Między magazynami",
};

export function DeliveryTab() {
  const [jobs, setJobs] = useState<TransportJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/relay/transport-jobs?limit=50");
        const json = await res.json();
        setJobs(json.jobs ?? []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Status zleceń transportowych powiązanych z tym punktem (odbiór do
        serwisu, zwrot do klienta).
      </p>
      {jobs.length === 0 ? (
        <div
          className="text-center py-12 rounded-2xl border"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <Truck className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Brak aktywnych zleceń transportowych.</p>
          <p className="text-xs mt-1">
            Zlecenia powstają automatycznie gdy serwis wymaga przewiezienia
            urządzenia między punktami albo zwrotu klientowi.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
            const status = STATUS_LABELS[j.status] ?? {
              label: j.status,
              color: "#64748B",
            };
            return (
              <div
                key={j.id}
                className="p-3 rounded-xl border"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Package
                    className="w-4 h-4"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <span className="font-mono text-xs font-semibold">
                    {j.jobNumber}
                  </span>
                  <span
                    className="text-[10px] uppercase font-mono px-2 py-0.5 rounded"
                    style={{ background: status.color, color: "#fff" }}
                  >
                    {status.label}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {KIND_LABELS[j.kind] ?? j.kind}
                  </span>
                </div>
                {j.destinationAddress && (
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {j.destinationAddress}
                  </div>
                )}
                <div
                  className="text-xs mt-1 flex flex-wrap gap-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  {j.assignedDriver && <span>Kierowca: {j.assignedDriver}</span>}
                  {j.scheduledAt && (
                    <span>
                      Plan: {new Date(j.scheduledAt).toLocaleString("pl")}
                    </span>
                  )}
                  {j.deliveredAt && (
                    <span>
                      Dostarczono: {new Date(j.deliveredAt).toLocaleString("pl")}
                    </span>
                  )}
                </div>
                {j.notes && (
                  <p
                    className="text-xs mt-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {j.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
