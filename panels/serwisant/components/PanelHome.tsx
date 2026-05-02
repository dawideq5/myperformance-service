"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { DASHBOARD_HOME_URL } from "@/lib/dashboard-url";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  LogOut,
  MapPin,
  Phone,
  RotateCcw,
  Mail,
  User as UserIcon,
} from "lucide-react";
import { PanelLocationMap, type PanelLocation } from "./PanelLocationMap";
import { type ServiceTicket } from "./tabs/ServicesBoard";
import { ServiceDetailView } from "./ServiceDetailView";
import { PanelLayout } from "./PanelLayout";
import { ServiceDetailEmpty } from "./ServiceDetailEmpty";
import {
  DEFAULT_FILTERS,
  type FilterState,
} from "@/lib/serwisant/filters";
import { STATUS_GROUPS } from "@/lib/serwisant/status-meta";

const STORAGE_KEY = "panel-serwisant:selected-location";
const LEGACY_VIEW_MODE_KEY = "panel-serwisant:view-mode";

export function PanelHome({
  locations,
  userLabel,
  userEmail,
}: {
  locations: PanelLocation[];
  userLabel: string;
  userEmail: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select gdy 1 punkt; przywróć z localStorage gdy >1 i user już
  // wcześniej wybrał (zapamiętujemy żeby nie pytać przy każdym odświeżeniu).
  useEffect(() => {
    if (locations.length === 1) {
      setSelectedId(locations[0].id);
      return;
    }
    if (locations.length > 1) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && locations.find((l) => l.id === saved)) {
          setSelectedId(saved);
        }
      } catch {
        // localStorage may be disabled
      }
    }
  }, [locations]);

  const onSelect = useCallback((loc: PanelLocation) => {
    setSelectedId(loc.id);
    try {
      localStorage.setItem(STORAGE_KEY, loc.id);
    } catch {
      /* noop */
    }
    // Audit log — best-effort, brak czeka na response. Endpoint jest na
    // dashboard /api/panel/audit z Bearer KC token. Token mamy w cookie
    // sesji NextAuth — pobieramy go przez /api/auth/session.
    void fetch("/api/audit-relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId: loc.id,
        actionType: "panel.location.selected",
        payload: { name: loc.name, type: loc.type },
      }),
    }).catch(() => undefined);
  }, []);

  const onClearSelection = useCallback(() => {
    setSelectedId(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const selected = selectedId
    ? locations.find((l) => l.id === selectedId) ?? null
    : null;

  // ── 0 punktów: brak certu / nie przypisany ──────────────────────────────
  if (locations.length === 0) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "var(--bg-main)" }}
      >
        <div
          className="max-w-md w-full p-8 rounded-2xl border text-center"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(251, 191, 36, 0.1)", color: "#fbbf24" }}
          >
            <MapPin className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-semibold mb-2">
            Brak przypisanych punktów
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Twój certyfikat klienta nie ma przypisanych żadnych punktów
            serwisowy. Skontaktuj się z administratorem aby przypisać Cię
            do odpowiednich lokalizacji.
          </p>
          <div className="flex gap-2 justify-center">
            <a
              href={DASHBOARD_HOME_URL}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{
                background: "var(--accent)",
                color: "#fff",
              }}
            >
              ← Wróć do dashboardu
            </a>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              Wyloguj
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── >1 punktów i jeszcze nic nie wybrane: ekran wyboru z mapą ───────────
  if (!selected) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ background: "var(--bg-main)" }}
      >
        <header
          className="border-b backdrop-blur-md sticky top-0 z-10"
          style={{
            background: "var(--bg-header)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
            <a
              href={DASHBOARD_HOME_URL}
              className="flex items-center gap-2 font-bold tracking-tight"
              style={{ color: "var(--text-main)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">MyPerformance · Panel Serwisanta</span>
              <span className="sm:hidden">Serwisant</span>
            </a>
            <div className="flex items-center gap-2">
              {userLabel && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-surface)" }}>
                  <UserIcon className="w-4 h-4" style={{ color: "var(--accent)" }} />
                  <span className="text-sm">{userLabel}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Wyloguj</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-6 sm:py-8 space-y-4 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-main)" }}>
              Wybierz punkt serwisowy
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Masz dostęp do <strong>{locations.length}</strong>{" "}
              {locations.length === 1 ? "punktu" : "punktów"}. Wybierz, do
              którego chcesz się zalogować.
            </p>
          </div>

          {/* Mapa */}
          <div style={{ height: 380 }}>
            <PanelLocationMap
              locations={locations}
              onSelect={onSelect}
              className="h-full"
            />
          </div>

          {/* Lista kart — animowane hover */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {locations.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onSelect(l)}
                className="text-left p-5 rounded-2xl border transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {l.type === "service" ? (
                      <Building2 className="w-5 h-5" style={{ color: "#f43f5e" }} />
                    ) : (
                      <Briefcase className="w-5 h-5" style={{ color: "#0ea5e9" }} />
                    )}
                    <span className="font-semibold">{l.name}</span>
                  </div>
                  {l.warehouseCode && (
                    <span
                      className="text-[10px] uppercase font-mono px-2 py-0.5 rounded"
                      style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}
                    >
                      {l.warehouseCode}
                    </span>
                  )}
                </div>
                {l.address && (
                  <div
                    className="text-xs flex items-start gap-1.5 mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {l.address}
                  </div>
                )}
                {l.phone && (
                  <div
                    className="text-xs flex items-center gap-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Phone className="w-3 h-3" />
                    {l.phone}
                  </div>
                )}
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Wybrany punkt: pulpit z headerem ────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-main)" }}
    >
      <header
        className="border-b backdrop-blur-md sticky top-0 z-10"
        style={{
          background: "var(--bg-header)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href={DASHBOARD_HOME_URL}
              className="flex-shrink-0 p-2 rounded-lg"
              style={{ color: "var(--text-muted)" }}
              aria-label="Wróć do dashboardu"
              title="Powrót do dashboardu"
            >
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div className="min-w-0">
              <p
                className="font-bold text-base sm:text-lg truncate"
                style={{ color: "var(--text-main)" }}
              >
                {selected.name}
              </p>
              <p
                className="text-[11px] sm:text-xs truncate"
                style={{ color: "var(--text-muted)" }}
              >
                Panel Serwisanta
                {selected.warehouseCode ? ` · ${selected.warehouseCode}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {locations.length > 1 && (
              <button
                type="button"
                onClick={onClearSelection}
                className="p-2 rounded-lg flex items-center gap-1.5 text-xs font-medium hidden sm:flex"
                style={{ color: "var(--text-muted)" }}
                title="Zmień punkt"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Zmień punkt</span>
              </button>
            )}
            {userLabel && (
              <div
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                style={{ background: "var(--bg-surface)", color: "var(--text-main)" }}
              >
                <UserIcon
                  className="w-4 h-4"
                  style={{ color: "var(--accent)" }}
                />
                <span>{userLabel}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-2 rounded-lg flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
              aria-label="Wyloguj"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden lg:inline">Wyloguj</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col animate-fade-in">
        {/* Compact hero — bez mapy */}
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 pt-4">
          <div
            className="p-4 sm:p-5 rounded-2xl border flex items-center gap-4"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background:
                  selected.type === "service"
                    ? "rgba(244, 63, 94, 0.1)"
                    : "rgba(14, 165, 233, 0.1)",
                color: selected.type === "service" ? "#f43f5e" : "#0ea5e9",
              }}
            >
              {selected.type === "service" ? (
                <Building2 className="w-5 h-5" />
              ) : (
                <Briefcase className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h1 className="text-base sm:text-lg font-semibold truncate">
                  {selected.name}
                </h1>
                {selected.warehouseCode && (
                  <span
                    className="text-[10px] uppercase font-mono px-2 py-0.5 rounded"
                    style={{
                      background: "var(--bg-surface)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {selected.warehouseCode}
                  </span>
                )}
              </div>
              <div
                className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {selected.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {selected.address}
                  </span>
                )}
                {selected.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {selected.phone}
                  </span>
                )}
                {selected.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {selected.email}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Główna treść — widok 3-kolumnowy (sidebar filtrów / lista / detail) */}
        <div className="flex-1 mt-4">
          <ServicesView
            locationId={selected.id}
            availableLocations={locations}
            userEmail={userEmail}
          />
        </div>
      </main>
    </div>
  );
}

/**
 * Wewnętrzny komponent — fetch listy zleceń + przełącznik widoku
 * lista (3-kolumnowy PanelLayout). Filtrowanie lokalne po `filters` z sidebara.
 */
function ServicesView({
  locationId,
  availableLocations,
  userEmail,
}: {
  locationId: string;
  availableLocations: PanelLocation[];
  userEmail: string;
}) {
  const [services, setServices] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // One-time migration: usuń legacy klucz `view-mode` (kanban "Tablica"
  // został wycofany — pozostał tylko widok 3-kolumnowy).
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_VIEW_MODE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (filters.search.trim()) params.set("search", filters.search.trim());
      const res = await fetch(`/api/relay/services?${params.toString()}`);
      const json = await res.json();
      setServices(json.services ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filters.search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Lokalne filtrowanie po sidebar filters.
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      if (filters.statuses.length > 0 && !filters.statuses.includes(s.status as never)) {
        return false;
      }
      if (filters.locations.length > 0) {
        const sLoc = s.locationId ?? s.serviceLocationId ?? null;
        if (!sLoc || !filters.locations.includes(sLoc)) return false;
      }
      if (filters.period === "7d" || filters.period === "30d") {
        if (!s.createdAt) return false;
        const days = filters.period === "7d" ? 7 : 30;
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        if (new Date(s.createdAt).getTime() < cutoff) return false;
      }
      if (filters.period === "custom") {
        if (!s.createdAt) return false;
        const ts = new Date(s.createdAt).getTime();
        if (filters.customFrom) {
          if (ts < new Date(filters.customFrom).getTime()) return false;
        }
        if (filters.customTo) {
          // Inkluzywnie do końca dnia.
          const end = new Date(filters.customTo).getTime() + 24 * 60 * 60 * 1000;
          if (ts >= end) return false;
        }
      }
      return true;
    });
  }, [services, filters]);

  // Liczniki per status (po filtrach lokacji + period — bez status filter,
  // żeby sidebar pokazywał ile pasuje w pozostałych statusach).
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of services) {
      m[s.status] = (m[s.status] ?? 0) + 1;
    }
    return m;
  }, [services]);

  const selected = selectedId
    ? filteredServices.find((s) => s.id === selectedId) ??
      services.find((s) => s.id === selectedId) ??
      null
    : null;

  const sidebarLocations = useMemo(
    () =>
      availableLocations.map((l) => ({
        id: l.id,
        name: l.name,
      })),
    [availableLocations],
  );

  // Suppress unused warnings for STATUS_GROUPS/locationId — referenced for
  // potential future use (counts already cover statuses, locationId may
  // drive backend filter param later).
  void STATUS_GROUPS;
  void locationId;

  return (
    <PanelLayout
      services={filteredServices}
      selectedServiceId={selectedId}
      onSelectService={(id) => setSelectedId(id)}
      filters={filters}
      onFiltersChange={setFilters}
      locations={sidebarLocations}
      counts={counts}
      loading={loading}
      onRefresh={() => void refresh()}
      detailSlot={
        selected ? (
          <ServiceDetailView
            serviceId={selected.id}
            service={selected}
            currentUserEmail={userEmail}
            onUpdate={(updated) => {
              setServices((prev) =>
                prev.map((s) => (s.id === updated.id ? updated : s)),
              );
            }}
          />
        ) : (
          <ServiceDetailEmpty counts={counts} />
        )
      }
    />
  );
}
