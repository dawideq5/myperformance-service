"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Clock,
  Cpu,
  Eye,
  FileText,
  Loader2,
  Mail,
  Package,
  Phone,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Tablet,
  TabletSmartphone,
  Wrench,
  X,
} from "lucide-react";
import { openServiceReceipt, sendElectronicReceipt } from "../../lib/receipt";

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
  contactEmail?: string | null;
  description: string | null;
  amountEstimate: number | null;
  amountFinal: number | null;
  promisedAt: string | null;
  createdAt: string | null;
  photos: string[];
  accessories: string[];
}

type EReceiptStatus = "none" | "sent" | "signed" | "rejected" | "expired";

const ERECEIPT_BADGES: Record<
  EReceiptStatus,
  { label: string; bg: string; color: string }
> = {
  none: { label: "Brak", bg: "rgba(120,120,140,0.18)", color: "#aaa" },
  sent: { label: "Wysłane", bg: "rgba(14, 165, 233, 0.18)", color: "#0EA5E9" },
  signed: { label: "Podpisane", bg: "rgba(34, 197, 94, 0.18)", color: "#22C55E" },
  rejected: { label: "Odrzucone", bg: "rgba(239, 68, 68, 0.18)", color: "#EF4444" },
  expired: { label: "Wygasłe", bg: "rgba(245, 158, 11, 0.18)", color: "#F59E0B" },
};

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

function ServiceCard({
  service,
  onChanged,
}: {
  service: ServiceTicket;
  onChanged?: () => void;
}) {
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
  const hasEmail = !!(service.contactEmail ?? "").trim();
  const [eStatus, setEStatus] = useState<EReceiptStatus>("none");
  const [sendingE, setSendingE] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const eBadge = ERECEIPT_BADGES[eStatus];

  const handleSendElectronic = async () => {
    if (!hasEmail) return;
    setSendingE(true);
    try {
      const r = await sendElectronicReceipt(service.id);
      if (r.ok) {
        setEStatus("sent");
        onChanged?.();
        alert(
          `Potwierdzenie elektroniczne wysłane do klienta. Documenso doc ID: ${r.documentId}`,
        );
      } else {
        alert(`Błąd wysyłki: ${r.error ?? "nieznany"}`);
      }
    } finally {
      setSendingE(false);
    }
  };

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
          <button
            type="button"
            onClick={handleSendElectronic}
            disabled={!hasEmail || sendingE}
            className="px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: hasEmail
                ? "linear-gradient(135deg, #06B6D4, #0891B2)"
                : "rgba(120,120,140,0.4)",
              color: "#fff",
              opacity: hasEmail ? 1 : 0.6,
            }}
            title={
              hasEmail
                ? "Wyślij elektroniczne potwierdzenie do klienta"
                : "Brak adresu email klienta — wyślij papierowe lub uzupełnij dane"
            }
          >
            {sendingE ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Mail className="w-3 h-3" />
            )}
            <span className="hidden md:inline">E-mail</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            className="px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 border transition-all hover:scale-[1.02]"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
            title={isReceived ? "Edytuj zlecenie" : "Szczegóły zlecenia"}
          >
            <Eye className="w-3 h-3" />
            <span className="hidden md:inline">{isReceived ? "Edytuj" : "Szczegóły"}</span>
          </button>
        </div>
        {/* E-receipt status badge */}
        <div className="flex items-center justify-end mt-1">
          <span
            className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: eBadge.bg, color: eBadge.color }}
            title="Status potwierdzenia elektronicznego"
          >
            <Send className="w-2.5 h-2.5" />
            {eBadge.label}
          </span>
        </div>
      </div>
      {showDetail && (
        <ServiceDetailDialog
          serviceId={service.id}
          onClose={() => setShowDetail(false)}
          onSendElectronic={hasEmail ? handleSendElectronic : undefined}
          isReceived={isReceived}
        />
      )}
    </div>
  );
}

/** Read-only widok szczegółów zlecenia. Fetch /api/relay/services/{id} +
 * pokazanie wszystkich danych. Dla status=received pozwala wysłać
 * elektroniczne potwierdzenie. */
function ServiceDetailDialog({
  serviceId,
  onClose,
  onSendElectronic,
  isReceived,
}: {
  serviceId: string;
  onClose: () => void;
  onSendElectronic?: () => void;
  isReceived: boolean;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`/api/relay/services/${serviceId}`);
        const j = await r.json();
        setData(j.service ?? j.data?.service ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [serviceId]);

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        <div
          className="sticky top-0 px-5 py-3 border-b backdrop-blur-md flex items-center justify-between"
          style={{
            background: "var(--bg-header)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div>
            <p className="text-base font-semibold">
              {isReceived ? "Edycja zlecenia" : "Szczegóły zlecenia"}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {(data?.ticketNumber as string) ?? "…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        {loading ? (
          <div className="p-12 text-center">
            <Loader2
              className="w-6 h-6 animate-spin mx-auto"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
        ) : !data ? (
          <div className="p-6 text-center text-sm" style={{ color: "#ef4444" }}>
            Nie udało się pobrać szczegółów zlecenia.
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <DetailGrid data={data} />
            <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => openServiceReceipt(serviceId)}
                className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff",
                }}
              >
                <FileText className="w-4 h-4" />
                Otwórz potwierdzenie
              </button>
              {onSendElectronic && (
                <button
                  type="button"
                  onClick={() => {
                    onSendElectronic();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
                  style={{
                    background: "linear-gradient(135deg, #06B6D4, #0891B2)",
                    color: "#fff",
                  }}
                >
                  <Mail className="w-4 h-4" />
                  Wyślij elektroniczne
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailGrid({ data }: { data: Record<string, unknown> }) {
  const fields: { label: string; value: unknown }[] = [
    { label: "Numer", value: data.ticketNumber },
    { label: "Status", value: data.status },
    { label: "Marka", value: data.brand },
    { label: "Model", value: data.model },
    { label: "Kolor", value: data.color },
    { label: "IMEI", value: data.imei },
    { label: "Imię klienta", value: data.customerFirstName },
    { label: "Nazwisko klienta", value: data.customerLastName },
    { label: "Telefon", value: data.contactPhone },
    { label: "Email", value: data.contactEmail },
    { label: "Wycena (PLN)", value: data.amountEstimate },
    {
      label: "Opis usterki",
      value: data.description,
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((f) => (
        <div key={f.label}>
          <p
            className="text-[10px] uppercase tracking-wide font-semibold mb-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {f.label}
          </p>
          <p className="text-sm" style={{ color: "var(--text-main)" }}>
            {f.value != null && f.value !== ""
              ? String(f.value)
              : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}
