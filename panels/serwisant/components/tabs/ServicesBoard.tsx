"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, User } from "lucide-react";
import { ServiceDetailDialog } from "./ServiceDetailDialog";

export interface IntakeChecklist {
  screen?: string;
  body?: string;
  battery_health?: string;
  ports?: string;
  water_damage?: boolean;
  powers_on?: boolean;
  screen_responds?: boolean;
  customer_backup?: boolean;
  reset_consent?: boolean;
  notes?: string;
}

export interface ServiceTicket {
  id: string;
  ticketNumber: string;
  status: string;
  type: string | null;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  lockType: string;
  lockCode: string | null;
  signedInAccount: string | null;
  accessories: string[];
  intakeChecklist: IntakeChecklist;
  description: string | null;
  diagnosis: string | null;
  amountEstimate: number | null;
  amountFinal: number | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  photos: string[];
  receivedBy: string | null;
  assignedTechnician: string | null;
  transportStatus: string;
  promisedAt: string | null;
  createdAt: string | null;
  locationId: string | null;
  serviceLocationId: string | null;
}

const COLUMNS = [
  { status: "received", label: "Przyjęte", color: "#64748B" },
  { status: "diagnosing", label: "Diagnoza", color: "#0EA5E9" },
  { status: "awaiting_quote", label: "Wycena u klienta", color: "#F59E0B" },
  { status: "repairing", label: "Naprawa", color: "#A855F7" },
  { status: "testing", label: "Testy", color: "#06B6D4" },
  { status: "ready", label: "Gotowe", color: "#22C55E" },
] as const;

export function ServicesBoard({ userEmail }: { userEmail: string }) {
  const [services, setServices] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "200");
      const res = await fetch(`/api/relay/services?${params.toString()}`);
      const json = await res.json();
      setServices(json.services ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredByOwner = useMemo(() => {
    if (!onlyMine) return services;
    return services.filter(
      (s) =>
        s.assignedTechnician?.toLowerCase() === userEmail.toLowerCase(),
    );
  }, [services, onlyMine, userEmail]);

  const byStatus = useMemo(() => {
    const m: Record<string, ServiceTicket[]> = {};
    for (const c of COLUMNS) m[c.status] = [];
    for (const s of filteredByOwner) {
      if (m[s.status]) m[s.status].push(s);
    }
    return m;
  }, [filteredByOwner]);

  const selected = selectedId
    ? services.find((s) => s.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-2 flex-1 min-w-[240px] px-3 py-2 rounded-lg border"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <Search className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj…"
            className="bg-transparent outline-none text-sm flex-1"
            style={{ color: "var(--text-main)" }}
          />
        </div>
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
          <span className="text-xs font-medium">Tylko moje</span>
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

      {loading && services.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2
            className="w-6 h-6 animate-spin"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
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
                {(byStatus[col.status] ?? []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className="w-full text-left p-2 rounded-lg border transition-colors hover:opacity-90"
                    style={{
                      background: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-main)",
                    }}
                  >
                    <div className="font-mono text-[10px] font-semibold mb-0.5">
                      {s.ticketNumber}
                    </div>
                    <div className="text-xs font-medium truncate">
                      {[s.brand, s.model].filter(Boolean).join(" ") || "—"}
                    </div>
                    {s.imei && (
                      <div
                        className="text-[10px] font-mono truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {s.imei}
                      </div>
                    )}
                    {s.assignedTechnician && (
                      <div
                        className="text-[10px] mt-1 truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        👤 {s.assignedTechnician.split("@")[0]}
                      </div>
                    )}
                    {s.amountEstimate != null && (
                      <div
                        className="text-[10px] mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        ~{s.amountEstimate} PLN
                      </div>
                    )}
                  </button>
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
        <ServiceDetailDialog
          service={selected}
          userEmail={userEmail}
          onClose={() => setSelectedId(null)}
          onUpdated={() => {
            void refresh();
          }}
        />
      )}
    </div>
  );
}
