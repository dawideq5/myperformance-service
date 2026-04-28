"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Clock,
  Cpu,
  FileText,
  Loader2,
  Package,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  TabletSmartphone,
  Wrench,
} from "lucide-react";
import { openServiceReceipt } from "../../lib/receipt";

interface ServiceTicket {
  id: string;
  ticketNumber: string;
  status: string;
  type: string | null;
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
  photos: string[];
  accessories: string[];
}

const STATUS_LABELS: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  received: { label: "Przyjęty", color: "#64748B", bg: "#64748B22" },
  diagnosing: { label: "Diagnoza", color: "#0EA5E9", bg: "#0EA5E922" },
  awaiting_quote: { label: "Wycena", color: "#F59E0B", bg: "#F59E0B22" },
  repairing: { label: "Naprawa", color: "#A855F7", bg: "#A855F722" },
  testing: { label: "Testy", color: "#06B6D4", bg: "#06B6D422" },
  ready: { label: "Gotowy", color: "#22C55E", bg: "#22C55E22" },
  delivered: { label: "Wydany", color: "#16A34A", bg: "#16A34A22" },
  cancelled: { label: "Anulowany", color: "#EF4444", bg: "#EF444422" },
  archived: { label: "Archiwum", color: "#1F2937", bg: "#1F293722" },
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Wszystkie" },
  { value: "received", label: "Przyjęte" },
  { value: "diagnosing", label: "Diagnoza" },
  { value: "repairing", label: "Naprawa" },
  { value: "ready", label: "Gotowe" },
  { value: "delivered", label: "Wydane" },
];

const DEVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  phone: Smartphone,
  tablet: Tablet,
  laptop: Cpu,
  smartwatch: TabletSmartphone,
  headphones: TabletSmartphone,
};

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-2 flex-1 min-w-[240px] px-3 py-2 rounded-xl border transition-colors focus-within:border-[var(--accent)]"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <Search className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj IMEI, marka, model, klient…"
            className="bg-transparent outline-none text-sm flex-1"
            style={{ color: "var(--text-main)" }}
          />
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="p-2.5 rounded-xl border transition-all hover:scale-105"
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

      <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
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
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105 flex items-center gap-1.5 whitespace-nowrap"
              style={{
                background: active
                  ? "linear-gradient(135deg, var(--accent), #2563eb)"
                  : "var(--bg-surface)",
                color: active ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <span>{f.label}</span>
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  background: active ? "rgba(255,255,255,0.2)" : "var(--bg-card)",
                }}
              >
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="p-3 rounded-xl border flex items-center gap-2 text-sm animate-fade-in"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            borderColor: "rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
          }}
        >
          <AlertCircle className="w-4 h-4" />
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
          <Wrench
            className="w-10 h-10 mx-auto mb-2 opacity-50"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm">
            Brak zleceń{statusFilter ? " w tym statusie" : ""}.
          </p>
          <p className="text-xs mt-1">
            Dodaj pierwsze w zakładce „Dodaj serwis&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceTicket }) {
  const status = STATUS_LABELS[service.status] ?? {
    label: service.status,
    color: "#64748B",
    bg: "#64748B22",
  };
  const DeviceIcon = DEVICE_ICONS[service.type ?? ""] ?? Smartphone;
  const customerName =
    [service.customerFirstName, service.customerLastName]
      .filter(Boolean)
      .join(" ") || "—";
  const isReceived = service.status === "received";

  return (
    <div
      className="p-3 rounded-2xl border transition-all duration-200 hover:scale-[1.01] hover:shadow-lg flex gap-3"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-main)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, ${status.color}33, ${status.color}11)`,
          color: status.color,
        }}
      >
        <DeviceIcon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="font-mono text-[10px] font-bold opacity-70">
            {service.ticketNumber}
          </span>
          <span
            className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: status.bg, color: status.color }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: status.color }}
            />
            {status.label}
          </span>
        </div>
        <div className="text-sm font-semibold truncate">
          {[service.brand, service.model].filter(Boolean).join(" ") || "Brak danych"}
        </div>
        {service.imei && (
          <div
            className="text-[10px] font-mono mt-0.5 truncate"
            style={{ color: "var(--text-muted)" }}
          >
            IMEI: {service.imei}
          </div>
        )}
        <div
          className="text-xs mt-1 flex items-center gap-1 truncate"
          style={{ color: "var(--text-muted)" }}
        >
          <Phone className="w-3 h-3" />
          {customerName}
          {service.contactPhone && ` · ${service.contactPhone}`}
        </div>
        {service.description && (
          <p
            className="text-xs mt-1.5 line-clamp-2"
            style={{ color: "var(--text-muted)" }}
          >
            {service.description}
          </p>
        )}
        <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
            {service.photos.length > 0 && (
              <span className="flex items-center gap-0.5">
                📷 {service.photos.length}
              </span>
            )}
            {service.accessories.length > 0 && (
              <span className="flex items-center gap-0.5">
                <Package className="w-3 h-3" />
                {service.accessories.length}
              </span>
            )}
            {service.createdAt && (
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {new Date(service.createdAt).toLocaleDateString("pl", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </div>
          <div className="text-xs font-semibold">
            {service.amountFinal != null ? (
              <span style={{ color: "#22C55E" }}>{service.amountFinal} PLN</span>
            ) : service.amountEstimate != null ? (
              <span style={{ color: "var(--text-muted)" }}>
                ~{service.amountEstimate} PLN
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => openServiceReceipt(service.id)}
            className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "#fff",
            }}
            title="Otwórz potwierdzenie w nowej karcie"
          >
            <FileText className="w-3 h-3" />
            <span className="hidden sm:inline">Potwierdzenie</span>
            <span className="sm:hidden">PDF</span>
          </button>
          {isReceived && (
            <button
              type="button"
              onClick={() => {
                // Edycja przed obróbką — w P30-B otworzy AddServiceTab w trybie
                // edit z prefill. Na razie placeholder.
                alert(
                  "Edycja zlecenia — implementacja w toku. Na razie skontaktuj się z administratorem.",
                );
              }}
              className="px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 border transition-all hover:scale-[1.02]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
              title="Edytuj zlecenie (tylko Przyjęty)"
            >
              <Pencil className="w-3 h-3" />
              <span className="hidden sm:inline">Edytuj</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
