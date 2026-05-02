"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Filter,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { SidebarFilters, type SidebarLocation } from "./SidebarFilters";
import { ServiceListItem } from "./ServiceListItem";
import { ServiceDetailEmpty } from "./ServiceDetailEmpty";
import type { ServiceTicket } from "./tabs/ServicesBoard";
import type { FilterState } from "@/lib/serwisant/filters";

export type ViewMode = "list" | "board";

interface PanelLayoutProps {
  /** Już przefiltrowana lista do renderu w środkowej kolumnie. */
  services: ServiceTicket[];
  selectedServiceId: string | null;
  onSelectService: (id: string) => void;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  locations: SidebarLocation[];
  /** Liczniki per status — dla sidebar i empty state. */
  counts: Record<string, number>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** Slot dla prawej kolumny — QuickPreview lub ServiceDetailEmpty. */
  detailSlot: ReactNode;
  /** Slot dla widoku tablicy (kanban) — renderowany zamiast listy. */
  boardSlot?: ReactNode;
  /** Header (sticky top) — jeśli null, renderujemy domyślny mini-header. */
  headerSlot?: ReactNode;
  loading?: boolean;
  onRefresh?: () => void;
}

export function PanelLayout({
  services,
  selectedServiceId,
  onSelectService,
  filters,
  onFiltersChange,
  locations,
  counts,
  viewMode,
  onViewModeChange,
  detailSlot,
  boardSlot,
  headerSlot,
  loading = false,
  onRefresh,
}: PanelLayoutProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Mobile auto-open detail when item picked.
  useEffect(() => {
    if (selectedServiceId) setMobileDetailOpen(true);
  }, [selectedServiceId]);

  const middleHeader = useMemo(
    () => (
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="md:hidden p-2 rounded-lg border"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
          aria-label="Otwórz filtry"
        >
          <Filter className="w-4 h-4" />
        </button>

        <div
          className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border"
          style={{
            background: "var(--bg-main)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <Search
            className="w-4 h-4"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) =>
              onFiltersChange({ ...filters, search: e.target.value })
            }
            placeholder="Szukaj zlecenia, klienta, IMEI…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--text-main)" }}
          />
        </div>

        <div
          className="hidden sm:inline-flex rounded-lg border overflow-hidden"
          style={{ borderColor: "var(--border-subtle)" }}
          role="tablist"
          aria-label="Tryb widoku"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "list"}
            onClick={() => onViewModeChange("list")}
            className="px-2.5 py-1.5 text-xs flex items-center gap-1.5"
            style={{
              background:
                viewMode === "list" ? "var(--accent)" : "var(--bg-main)",
              color: viewMode === "list" ? "#fff" : "var(--text-muted)",
            }}
          >
            <List className="w-3.5 h-3.5" />
            Lista
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "board"}
            onClick={() => onViewModeChange("board")}
            className="px-2.5 py-1.5 text-xs flex items-center gap-1.5"
            style={{
              background:
                viewMode === "board" ? "var(--accent)" : "var(--bg-main)",
              color: viewMode === "board" ? "#fff" : "var(--text-muted)",
            }}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Tablica
          </button>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="p-2 rounded-lg border"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
            aria-label="Odśwież listę"
            title="Odśwież"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        )}
      </div>
    ),
    [filters, loading, onFiltersChange, onRefresh, onViewModeChange, viewMode],
  );

  const listColumn = (
    <div className="flex flex-col h-full">
      {middleHeader}

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading && services.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2
              className="w-5 h-5 animate-spin"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
        ) : services.length === 0 ? (
          <p
            className="text-center text-sm py-12"
            style={{ color: "var(--text-muted)" }}
          >
            Brak zleceń pasujących do filtrów.
          </p>
        ) : (
          services.map((s) => (
            <ServiceListItem
              key={s.id}
              service={s}
              selected={selectedServiceId === s.id}
              onClick={() => onSelectService(s.id)}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[260px_minmax(320px,420px)_1fr] min-h-[calc(100vh-64px)]"
      style={{ background: "var(--bg-main)" }}
    >
      {/* Left: filters (desktop) */}
      <SidebarFilters
        filters={filters}
        onChange={onFiltersChange}
        locations={locations}
        counts={counts}
        variant="desktop"
      />

      {/* Middle: list or board */}
      <div
        className="flex flex-col min-h-[400px] border-r"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {headerSlot}
        {viewMode === "board" && boardSlot ? (
          <>
            {middleHeader}
            <div className="flex-1 overflow-y-auto p-3">{boardSlot}</div>
          </>
        ) : (
          listColumn
        )}
      </div>

      {/* Right: detail */}
      <div
        className="hidden md:flex flex-col min-h-[400px]"
        style={{ background: "var(--bg-main)" }}
      >
        {detailSlot ?? <ServiceDetailEmpty counts={counts} />}
      </div>

      {/* Mobile filter drawer */}
      {mobileFiltersOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Filtry zleceń"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden="true"
          />
          <div
            className="relative ml-auto w-[85%] max-w-[320px] h-full overflow-y-auto"
            style={{ background: "var(--bg-card)" }}
          >
            <div
              className="flex items-center justify-between p-3 border-b"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-main)" }}
              >
                Filtry
              </span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1.5 rounded-lg"
                style={{ color: "var(--text-muted)" }}
                aria-label="Zamknij filtry"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarFilters
              filters={filters}
              onChange={onFiltersChange}
              locations={locations}
              counts={counts}
              variant="mobile"
            />
          </div>
        </div>
      )}

      {/* Mobile detail full-screen */}
      {mobileDetailOpen && selectedServiceId && (
        <div
          className="md:hidden fixed inset-0 z-40 flex flex-col"
          style={{ background: "var(--bg-main)" }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex items-center justify-between p-3 border-b"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--text-main)" }}
            >
              Szczegóły zlecenia
            </span>
            <button
              type="button"
              onClick={() => setMobileDetailOpen(false)}
              className="p-1.5 rounded-lg"
              style={{ color: "var(--text-muted)" }}
              aria-label="Zamknij szczegóły"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{detailSlot}</div>
        </div>
      )}
    </div>
  );
}
