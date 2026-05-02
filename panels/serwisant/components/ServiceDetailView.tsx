"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Loader2, RefreshCw, Settings2, X } from "lucide-react";
import type { ServiceTicket } from "./tabs/ServicesBoard";
import { StatusBadge } from "./StatusBadge";
import { StatusTransitionModal } from "./StatusTransitionModal";
import type { ServiceStatus } from "@/lib/serwisant/status-meta";
import { DiagnozaTab } from "./detail/DiagnozaTab";
import { NaprawaTab } from "./detail/NaprawaTab";
import { WycenaTab } from "./detail/WycenaTab";
import { KlientTab } from "./detail/KlientTab";
import { HistoriaTab } from "./detail/HistoriaTab";
import { CzatZespoluTab } from "./detail/CzatZespoluTab";
import { InternalNotesPanel } from "./detail/InternalNotesPanel";
import { subscribeToService, subscribeToUser } from "@/lib/sse-client";
import { ViewSettingsModal, type TabSpec } from "./ViewSettingsModal";
import { useServiceDetailPrefs } from "./useServiceDetailPrefs";
import { PanelUserProvider, usePanelUser } from "./PanelUserContext";

type TabId =
  | "diagnoza"
  | "naprawa"
  | "wycena"
  | "klient"
  | "czat"
  | "notatki"
  | "historia";

const TABS: { id: TabId; label: string }[] = [
  { id: "diagnoza", label: "Diagnoza" },
  { id: "naprawa", label: "Naprawa" },
  { id: "wycena", label: "Wycena" },
  { id: "klient", label: "Klient" },
  { id: "czat", label: "Czat zespołu" },
  { id: "notatki", label: "Notatki" },
  { id: "historia", label: "Historia" },
];

const TABS_FOR_MODAL: TabSpec[] = TABS.map((t) => ({
  id: t.id,
  label: t.label,
}));

interface ServiceDetailViewProps {
  serviceId: string;
  /** Jeśli przekazane, oszczędzamy dodatkowy fetch. */
  service?: ServiceTicket;
  onClose?: () => void;
  onUpdate: (updated: ServiceTicket) => void;
  /** Gdy true, render z przyciskiem zamknięcia (tryb modal/drawer). */
  inModal?: boolean;
  /** Email zalogowanego usera — do filtrowania uprawnień (delete/pin notatek). */
  currentUserEmail?: string;
  /**
   * Wave 20 — realm roles z KC tokenu (`session.user.roles`). Propagowane
   * do `PanelUserProvider` i wykorzystywane przez RBAC w detail view
   * (edycja, usuwanie, override cen, terminalne statusy).
   */
  currentUserRoles?: readonly string[];
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

export function ServiceDetailView(props: ServiceDetailViewProps) {
  const { currentUserEmail = "", currentUserRoles = [], ...rest } = props;
  return (
    <PanelUserProvider email={currentUserEmail} roles={currentUserRoles}>
      <ServiceDetailViewInner {...rest} currentUserEmail={currentUserEmail} />
    </PanelUserProvider>
  );
}

interface InnerProps {
  serviceId: string;
  service?: ServiceTicket;
  onClose?: () => void;
  onUpdate: (updated: ServiceTicket) => void;
  inModal?: boolean;
  currentUserEmail: string;
}

function ServiceDetailViewInner({
  serviceId,
  service: initialService,
  onClose,
  onUpdate,
  inModal = false,
  currentUserEmail,
}: InnerProps) {
  const panelUser = usePanelUser();
  const {
    value: viewPrefs,
    ready: prefsReady,
    setValue: setViewPrefs,
    reset: resetPrefs,
  } = useServiceDetailPrefs();
  const [service, setService] = useState<ServiceTicket | null>(
    initialService ?? null,
  );
  const [loading, setLoading] = useState(!initialService);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("diagnoza");
  const [tabTouched, setTabTouched] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusModalTarget, setStatusModalTarget] = useState<
    ServiceStatus | undefined
  >(undefined);
  // Wave 20 / Faza 1F — generic version counter inkrementowany na każdy
  // service-scoped SSE event. Child taby (KlientTab → ChatwootDeepLink)
  // dostają jako prop i włączają w useEffect deps żeby re-fetch.
  const [realtimeVersion, setRealtimeVersion] = useState(0);
  // Banner powiadamiający o nowej wiadomości od klienta (chat_message_received).
  // Auto-dismiss po 8s. Klikable dismiss.
  const [chatBanner, setChatBanner] = useState<string | null>(null);

  // Apply default landing tab gdy preferences załadują się (raz, jeśli user
  // jeszcze nie kliknął żadnej zakładki).
  useEffect(() => {
    if (!prefsReady || tabTouched) return;
    const wanted = viewPrefs.defaultLandingTab as TabId;
    if (TABS.some((t) => t.id === wanted) && wanted !== activeTab) {
      setActiveTab(wanted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsReady]);

  // Resolve final ordered + visible tabs.
  const visibleTabs = useMemo<{ id: TabId; label: string }[]>(() => {
    const byId = new Map(TABS.map((t) => [t.id, t]));
    const result: { id: TabId; label: string }[] = [];
    const seen = new Set<TabId>();
    for (const id of viewPrefs.tabOrder) {
      const t = byId.get(id as TabId);
      if (t && viewPrefs.tabVisibility[id] !== false) {
        result.push(t);
        seen.add(t.id);
      }
    }
    for (const t of TABS) {
      if (seen.has(t.id)) continue;
      if (viewPrefs.tabVisibility[t.id] === false) continue;
      result.push(t);
    }
    return result;
  }, [viewPrefs.tabOrder, viewPrefs.tabVisibility]);

  // Fallback gdy aktualna activeTab nie jest widoczna — wybierz pierwszą.
  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

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

  // Real-time SSE bus (Wave 19/Phase 1D + Faza 1F).
  //
  // Pattern: ServiceDetailView centralnie subskrybuje wszystkie service-
  // scoped eventy. Dla `status_changed` / `service_updated` ustawiamy
  // service inline (backend dorzuca mapped service w payload). Dla reszty
  // bumpujemy `realtimeVersion` — child taby (KlientTab → ChatwootDeepLink,
  // CustomerMessageSender) z propsem realtimeVersion samodzielnie re-fetchują.
  // `chat_message_received` dodatkowo pokazuje banner powiadomienia.
  // Komponenty z własną subskrypcją (InternalNotesPanel) zostają — duplikacja
  // jest tania (dedup po event.id w sse-client.ts).
  useEffect(() => {
    const unsub = subscribeToService(serviceId, (evt) => {
      if (evt.type === "status_changed" || evt.type === "service_updated") {
        const svc = (evt.payload as { service?: ServiceTicket }).service;
        if (svc) {
          setService(svc);
          onUpdate(svc);
        } else {
          refresh();
        }
      } else if (evt.type === "chat_message_received") {
        const preview =
          typeof (evt.payload as { messagePreview?: unknown }).messagePreview ===
          "string"
            ? ((evt.payload as { messagePreview?: string }).messagePreview ?? "")
            : "";
        setChatBanner(
          preview
            ? `Nowa wiadomość od klienta: ${preview.slice(0, 100)}${preview.length > 100 ? "…" : ""}`
            : "Klient wysłał nową wiadomość",
        );
      }
      // Bump version dla wszystkich service-scoped eventów — child taby
      // re-fetch przez useEffect deps.
      setRealtimeVersion((v) => v + 1);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  // User-scoped subscription — cross-service notyfikacje (np. assigned
  // transport job dla tego service'a). Bumpujemy version tylko dla eventów
  // dotyczących bieżącego service'a — global powiadomienia obsługuje
  // panel-home toast/bell.
  useEffect(() => {
    if (!currentUserEmail) return;
    const unsub = subscribeToUser(currentUserEmail, (evt) => {
      if (evt.serviceId && evt.serviceId === serviceId) {
        setRealtimeVersion((v) => v + 1);
      }
    });
    return unsub;
  }, [currentUserEmail, serviceId]);

  // Auto-dismiss banneru po 8s.
  useEffect(() => {
    if (!chatBanner) return;
    const id = window.setTimeout(() => setChatBanner(null), 8_000);
    return () => window.clearTimeout(id);
  }, [chatBanner]);

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
    <div
      className="flex flex-col h-full mp-detail-root"
      role="region"
      aria-label="Szczegóły zlecenia"
      data-density={viewPrefs.density}
      data-font-size={viewPrefs.fontSize}
    >
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
            {panelUser.permissions.canEditServiceData && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider"
                style={{
                  background: "rgba(59, 130, 246, 0.15)",
                  color: "#3b82f6",
                }}
                title="Masz pełne uprawnienia administracyjne (RBAC Wave 20)"
              >
                admin
              </span>
            )}
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
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg border"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
            aria-label="Ustawienia widoku"
            title="Ustawienia widoku"
          >
            <Settings2 className="w-4 h-4" />
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

      {/* Real-time banner — nowa wiadomość od klienta (chat_message_received).
          Wyświetla się przez 8s, klikalny dismiss. */}
      {chatBanner && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-2 px-4 py-2 border-b animate-fade-in"
          style={{
            background: "rgba(99, 102, 241, 0.12)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        >
          <span className="flex items-center gap-2 text-xs">
            <Bell className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} aria-hidden="true" />
            {chatBanner}
          </span>
          <button
            type="button"
            onClick={() => setChatBanner(null)}
            className="p-1 rounded"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij powiadomienie"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

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
        {visibleTabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`tab-panel-${t.id}`}
              id={`tab-${t.id}`}
              onClick={() => {
                setActiveTab(t.id);
                setTabTouched(true);
              }}
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
            onServiceUpdated={handleSubUpdate}
            realtimeVersion={realtimeVersion}
          />
        )}
        {activeTab === "wycena" && (
          <WycenaTab
            service={service}
            onUpdate={handleSubUpdate}
            realtimeVersion={realtimeVersion}
          />
        )}
        {activeTab === "klient" && (
          <KlientTab
            service={service}
            onUpdate={handleSubUpdate}
            realtimeVersion={realtimeVersion}
          />
        )}
        {activeTab === "czat" && (
          <CzatZespoluTab service={service} defaultRole="service" />
        )}
        {activeTab === "notatki" && (
          <InternalNotesPanel
            serviceId={service.id}
            currentUserEmail={currentUserEmail}
          />
        )}
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

      <ViewSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        allTabs={TABS_FOR_MODAL}
        value={viewPrefs}
        onChange={setViewPrefs}
        onReset={resetPrefs}
      />
    </div>
  );
}
