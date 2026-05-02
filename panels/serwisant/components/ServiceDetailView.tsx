"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import type { ServiceTicket } from "./tabs/ServicesBoard";
import { StatusBadge } from "./StatusBadge";
import { StatusTransitionModal } from "./StatusTransitionModal";
import type { ServiceStatus } from "@/lib/serwisant/status-meta";
import { DiagnozaTab } from "./detail/DiagnozaTab";
import { NaprawaTab } from "./detail/NaprawaTab";
import { WycenaTab } from "./detail/WycenaTab";
import { KlientTab } from "./detail/KlientTab";
import { HistoriaTab } from "./detail/HistoriaTab";

type TabId = "diagnoza" | "naprawa" | "wycena" | "klient" | "historia";

const TABS: { id: TabId; label: string }[] = [
  { id: "diagnoza", label: "Diagnoza" },
  { id: "naprawa", label: "Naprawa" },
  { id: "wycena", label: "Wycena" },
  { id: "klient", label: "Klient" },
  { id: "historia", label: "Historia" },
];

interface ServiceDetailViewProps {
  serviceId: string;
  /** Jeśli przekazane, oszczędzamy dodatkowy fetch. */
  service?: ServiceTicket;
  onClose?: () => void;
  onUpdate: (updated: ServiceTicket) => void;
  /** Gdy true, render z przyciskiem zamknięcia (tryb modal/drawer). */
  inModal?: boolean;
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
  return `${day} d. temu`;
}

export function ServiceDetailView({
  serviceId,
  service: initialService,
  onClose,
  onUpdate,
  inModal = false,
}: ServiceDetailViewProps) {
  const [service, setService] = useState<ServiceTicket | null>(
    initialService ?? null,
  );
  const [loading, setLoading] = useState(!initialService);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("diagnoza");
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusModalTarget, setStatusModalTarget] = useState<
    ServiceStatus | undefined
  >(undefined);

  // Sync gdy parent zmieni serviceId / service.
  useEffect(() => {
    if (initialService && initialService.id === serviceId) {
      setService(initialService);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/relay/services/${serviceId}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as
          | { service?: ServiceTicket; error?: string }
          | null;
        if (cancelled) return;
        if (!r.ok) {
          setError(j?.error ?? `HTTP ${r.status}`);
          setService(null);
        } else if (j?.service) {
          setService(j.service);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Błąd sieci");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, initialService]);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/relay/services/${serviceId}`)
      .then((r) => r.json())
      .then((j: { service?: ServiceTicket }) => {
        if (j?.service) {
          setService(j.service);
          onUpdate(j.service);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  const handleSubUpdate = (updated: ServiceTicket) => {
    setService(updated);
    onUpdate(updated);
  };

  const requestStatusChange = (target?: ServiceStatus) => {
    setStatusModalTarget(target);
    setStatusModalOpen(true);
  };

  const headerSubtitle = useMemo(() => {
    if (!service) return null;
    const customer = [service.customerFirstName, service.customerLastName]
      .filter(Boolean)
      .join(" ");
    const device = [service.brand, service.model].filter(Boolean).join(" ");
    return [customer, device, formatRelative(service.createdAt)]
      .filter(Boolean)
      .join(" · ");
  }, [service]);

  if (loading && !service) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  if (error && !service) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm" style={{ color: "#ef4444" }}>
          Nie udało się załadować zlecenia: {error}
        </p>
      </div>
    );
  }

  if (!service) return null;

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Szczegóły zlecenia">
      {/* Header */}
      <div
        className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3 border-b"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-mono text-sm font-semibold"
              style={{ color: "var(--text-main)" }}
            >
              #{service.ticketNumber}
            </span>
            <StatusBadge status={service.status} size="sm" />
          </div>
          {headerSubtitle && (
            <p
              className="text-xs mt-0.5 truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {headerSubtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => requestStatusChange(undefined)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: "var(--accent)",
              color: "#fff",
            }}
          >
            Zmień status
          </button>
          <button
            type="button"
            onClick={refresh}
            className="p-2 rounded-lg border"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
            aria-label="Odśwież zlecenie"
            title="Odśwież"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
          {inModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg"
              style={{ color: "var(--text-muted)" }}
              aria-label="Zamknij"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 px-2 sm:px-4 border-b overflow-x-auto"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
        }}
        role="tablist"
        aria-label="Sekcje szczegółów zlecenia"
      >
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`tab-panel-${t.id}`}
              id={`tab-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              className="px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap"
              style={{
                borderBottomColor: active ? "var(--accent)" : "transparent",
                color: active ? "var(--text-main)" : "var(--text-muted)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-5"
        role="tabpanel"
        id={`tab-panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === "diagnoza" && (
          <DiagnozaTab
            service={service}
            onUpdate={handleSubUpdate}
            onRequestStatusChange={requestStatusChange}
          />
        )}
        {activeTab === "naprawa" && (
          <NaprawaTab
            service={service}
            onRequestStatusChange={requestStatusChange}
          />
        )}
        {activeTab === "wycena" && (
          <WycenaTab service={service} onUpdate={handleSubUpdate} />
        )}
        {activeTab === "klient" && <KlientTab service={service} />}
        {activeTab === "historia" && <HistoriaTab service={service} />}
      </div>

      {statusModalOpen && (
        <StatusTransitionModal
          service={service}
          targetStatus={statusModalTarget}
          open={statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          onSuccess={(updated) => {
            handleSubUpdate(updated);
          }}
        />
      )}
    </div>
  );
}
