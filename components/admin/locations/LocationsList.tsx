"use client";

import { Briefcase, MapPin, Phone, Plus, Search, Wrench } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import type { Location, LocationType } from "@/lib/locations";

/**
 * Filtr-bar (typ punktu + search) i grid kafelków lokalizacji. Onclick na
 * kafelku otwiera edytor (parent dispatch).
 */
export function LocationsList({
  filtered,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  counts,
  onAdd,
  onSelect,
}: {
  filtered: Location[];
  filter: "all" | LocationType;
  onFilterChange: (f: "all" | LocationType) => void;
  query: string;
  onQueryChange: (q: string) => void;
  counts: { all: number; sales: number; service: number };
  onAdd: () => void;
  onSelect: (l: Location) => void;
}) {
  return (
    <>
      {/* Header z filtrami i akcją */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onFilterChange("all")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === "all"
                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
            }`}
          >
            Wszystkie ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => onFilterChange("sales")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
              filter === "sales"
                ? "bg-sky-500/10 text-sky-400"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" /> Sprzedaży ({counts.sales})
          </button>
          <button
            type="button"
            onClick={() => onFilterChange("service")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
              filter === "service"
                ? "bg-rose-500/10 text-rose-400"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" /> Serwisowe ({counts.service})
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Szukaj…"
              className="pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm w-full sm:w-56"
            />
          </div>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={onAdd}
          >
            Dodaj punkt
          </Button>
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card padding="lg">
          <p className="text-center text-sm text-[var(--text-muted)]">
            Brak punktów. Kliknij „Dodaj punkt&rdquo; aby utworzyć pierwszy.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((l) => (
            <button
              type="button"
              key={l.id}
              onClick={() => onSelect(l)}
              className="text-left p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 transition"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {l.type === "service" ? (
                    <Wrench className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Briefcase className="w-4 h-4 text-sky-400" />
                  )}
                  <span className="text-sm font-semibold">{l.name}</span>
                </div>
                {!l.enabled && <Badge tone="neutral">Wyłączony</Badge>}
              </div>
              {l.warehouseCode && (
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-mono mb-1">
                  {l.warehouseCode}
                </div>
              )}
              {l.address && (
                <div className="text-xs text-[var(--text-muted)] flex items-start gap-1.5 mb-1">
                  <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {l.address}
                </div>
              )}
              {l.phone && (
                <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                  <Phone className="w-3 h-3" />
                  {l.phone}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
