"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

interface ServiceTicket {
  id: string;
  ticketNumber: string;
  status: string;
  brand: string | null;
  model: string | null;
  imei: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  contactPhone: string | null;
  description: string | null;
  amountEstimate: number | null;
  amountFinal: number | null;
  promisedAt: string | null;
  createdAt: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  received: { label: "Przyjęty", color: "#64748B" },
  diagnosing: { label: "Diagnoza", color: "#0EA5E9" },
  awaiting_quote: { label: "Wycena", color: "#F59E0B" },
  repairing: { label: "Naprawa", color: "#A855F7" },
  testing: { label: "Testy", color: "#06B6D4" },
  ready: { label: "Gotowy", color: "#22C55E" },
  delivered: { label: "Wydany", color: "#16A34A" },
  cancelled: { label: "Anulowany", color: "#EF4444" },
  archived: { label: "Archiwum", color: "#1F2937" },
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Wszystkie" },
  { value: "received", label: "Przyjęte" },
  { value: "diagnosing", label: "Diagnoza" },
  { value: "repairing", label: "Naprawa" },
  { value: "ready", label: "Gotowe" },
  { value: "delivered", label: "Wydane" },
];

export function ServicesAllTab() {
  const [services, setServices] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/relay/services?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setServices(json.services ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd pobierania");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of services) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [services]);

  return (
    <div className="space-y-4">
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
            placeholder="Szukaj po IMEI, marce, modelu, kliencie…"
            className="bg-transparent outline-none text-sm flex-1"
            style={{ color: "var(--text-main)" }}
          />
        </div>
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

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.value;
          const cnt = f.value
            ? counts[f.value] ?? 0
            : services.length;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--bg-surface)",
                color: active ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {f.label} ({cnt})
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="p-3 rounded-lg border text-sm"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            borderColor: "rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
          }}
        >
          {error}
        </div>
      )}

      {loading && services.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2
            className="w-6 h-6 animate-spin"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      ) : services.length === 0 ? (
        <div
          className="text-center py-12 rounded-2xl border"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <p className="text-sm">
            Brak zleceń serwisowych
            {statusFilter ? ` w statusie „${STATUS_LABELS[statusFilter]?.label ?? statusFilter}\u201d` : ""}
            . Dodaj pierwsze w zakładce „Dodaj serwis&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((s) => (
            <ServiceRow key={s.id} service={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceRow({ service }: { service: ServiceTicket }) {
  const status = STATUS_LABELS[service.status] ?? {
    label: service.status,
    color: "#64748B",
  };
  return (
    <div
      className="p-4 rounded-xl border flex items-start gap-3"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-main)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-mono text-xs font-semibold">
            {service.ticketNumber}
          </span>
          <span
            className="text-[10px] uppercase font-mono px-2 py-0.5 rounded"
            style={{ background: status.color, color: "#fff" }}
          >
            {status.label}
          </span>
        </div>
        <div className="text-sm font-medium truncate">
          {[service.brand, service.model].filter(Boolean).join(" ")}{" "}
          {service.imei && (
            <span
              className="text-xs font-mono ml-1"
              style={{ color: "var(--text-muted)" }}
            >
              IMEI: {service.imei}
            </span>
          )}
        </div>
        <div
          className="text-xs mt-0.5 truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {[service.customerFirstName, service.customerLastName]
            .filter(Boolean)
            .join(" ")}
          {service.contactPhone ? ` · ${service.contactPhone}` : ""}
        </div>
        {service.description && (
          <p
            className="text-xs mt-1.5 line-clamp-2"
            style={{ color: "var(--text-muted)" }}
          >
            {service.description}
          </p>
        )}
      </div>
      <div className="text-right text-xs flex-shrink-0">
        {service.amountFinal != null ? (
          <div className="font-semibold">{service.amountFinal} PLN</div>
        ) : service.amountEstimate != null ? (
          <div style={{ color: "var(--text-muted)" }}>
            ~{service.amountEstimate} PLN
          </div>
        ) : null}
        {service.createdAt && (
          <div style={{ color: "var(--text-muted)" }}>
            {new Date(service.createdAt).toLocaleDateString("pl")}
          </div>
        )}
      </div>
    </div>
  );
}
