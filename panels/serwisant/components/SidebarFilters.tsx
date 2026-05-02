"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import {
  STATUS_GROUPS,
  STATUS_GROUP_LABELS,
  STATUS_META,
  type ServiceStatus,
} from "@/lib/serwisant/status-meta";
import {
  DEFAULT_FILTERS,
  isFilterActive,
  type FilterPeriod,
  type FilterPriority,
  type FilterState,
} from "@/lib/serwisant/filters";

export interface SidebarLocation {
  id: string;
  name: string;
}

interface SidebarFiltersProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  locations: SidebarLocation[];
  /** Liczniki: status -> ile zleceń. Może być niepełne. */
  counts: Record<string, number>;
  /** Override do mobilnego widoku — bez sticky. */
  variant?: "desktop" | "mobile";
}

const PRIORITY_OPTIONS: { id: FilterPriority; label: string }[] = [
  { id: "all", label: "Wszystkie" },
  { id: "urgent", label: "Pilne" },
  { id: "sla_breached", label: "SLA przekroczone" },
];

const PERIOD_OPTIONS: { id: FilterPeriod; label: string }[] = [
  { id: "7d", label: "7 dni" },
  { id: "30d", label: "30 dni" },
  { id: "all", label: "Wszystko" },
  { id: "custom", label: "Zakres" },
];

function sumGroup(
  group: ServiceStatus[],
  counts: Record<string, number>,
): number {
  return group.reduce((acc, s) => acc + (counts[s] ?? 0), 0);
}

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function SidebarFilters({
  filters,
  onChange,
  locations,
  counts,
  variant = "desktop",
}: SidebarFiltersProps) {
  const [openGroups, setOpenGroups] = useState<
    Record<keyof typeof STATUS_GROUPS, boolean>
  >({ open: true, waiting: false, ready: false, finished: false });

  const update = (patch: Partial<FilterState>) => {
    onChange({ ...filters, ...patch });
  };

  const toggleStatus = (status: ServiceStatus) => {
    update({ statuses: toggleInArray(filters.statuses, status) });
  };

  const toggleGroup = (groupKey: keyof typeof STATUS_GROUPS) => {
    const groupStatuses = STATUS_GROUPS[groupKey];
    const allSelected = groupStatuses.every((s) =>
      filters.statuses.includes(s),
    );
    if (allSelected) {
      update({
        statuses: filters.statuses.filter((s) => !groupStatuses.includes(s)),
      });
    } else {
      const merged = Array.from(
        new Set<ServiceStatus>([...filters.statuses, ...groupStatuses]),
      );
      update({ statuses: merged });
    }
  };

  const toggleLocation = (id: string) => {
    update({ locations: toggleInArray(filters.locations, id) });
  };

  const reset = () => {
    onChange({ ...DEFAULT_FILTERS });
  };

  const containerClass =
    variant === "desktop"
      ? "hidden md:flex md:flex-col md:sticky md:top-[64px] md:self-start md:max-h-[calc(100vh-64px)] md:overflow-y-auto"
      : "flex flex-col";

  return (
    <aside
      aria-label="Filtry zleceń"
      className={`${containerClass} w-full gap-5 p-4 border-r`}
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-main)",
      }}
    >
      {/* Statusy */}
      <section>
        <h3
          className="text-[11px] uppercase font-semibold mb-2 tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Statusy
        </h3>
        <div className="space-y-1">
          {(Object.keys(STATUS_GROUPS) as Array<keyof typeof STATUS_GROUPS>).map(
            (groupKey) => {
              const groupStatuses = STATUS_GROUPS[groupKey];
              const total = sumGroup(groupStatuses, counts);
              const allSelected = groupStatuses.every((s) =>
                filters.statuses.includes(s),
              );
              const anySelected = groupStatuses.some((s) =>
                filters.statuses.includes(s),
              );
              const isOpen = openGroups[groupKey];

              return (
                <div key={groupKey}>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((prev) => ({
                          ...prev,
                          [groupKey]: !prev[groupKey],
                        }))
                      }
                      className="p-1 rounded hover:bg-white/[0.04]"
                      aria-label={isOpen ? "Zwiń grupę" : "Rozwiń grupę"}
                      aria-expanded={isOpen}
                      style={{ color: "var(--text-muted)" }}
                    >
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <label className="flex-1 flex items-center justify-between gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-white/[0.04]">
                      <span className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="accent-[var(--accent)]"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = !allSelected && anySelected;
                          }}
                          onChange={() => toggleGroup(groupKey)}
                        />
                        <span style={{ color: "var(--text-main)" }}>
                          {STATUS_GROUP_LABELS[groupKey]}
                        </span>
                      </span>
                      <span
                        className="text-[11px] font-mono"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {total}
                      </span>
                    </label>
                  </div>
                  {isOpen && (
                    <ul className="ml-7 mt-1 space-y-0.5">
                      {groupStatuses.map((status) => {
                        const meta = STATUS_META[status];
                        if (!meta) return null;
                        const count = counts[status] ?? 0;
                        const checked = filters.statuses.includes(status);
                        return (
                          <li key={status}>
                            <label className="flex items-center justify-between gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-white/[0.04]">
                              <span className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  className="accent-[var(--accent)]"
                                  checked={checked}
                                  onChange={() => toggleStatus(status)}
                                />
                                <span style={{ color: "var(--text-main)" }}>
                                  {meta.label}
                                </span>
                              </span>
                              <span
                                className="text-[10px] font-mono"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {count}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            },
          )}
        </div>
      </section>

      {/* Lokacje */}
      {locations.length > 0 && (
        <section>
          <h3
            className="text-[11px] uppercase font-semibold mb-2 tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Lokacje
          </h3>
          <ul className="space-y-0.5">
            {locations.map((loc) => {
              const checked = filters.locations.includes(loc.id);
              return (
                <li key={loc.id}>
                  <label className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={checked}
                      onChange={() => toggleLocation(loc.id)}
                    />
                    <span
                      className="text-sm truncate"
                      style={{ color: "var(--text-main)" }}
                    >
                      {loc.name}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Priorytet */}
      <section>
        <h3
          className="text-[11px] uppercase font-semibold mb-2 tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Priorytet
        </h3>
        <div className="space-y-0.5">
          {PRIORITY_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-white/[0.04]"
            >
              <input
                type="radio"
                name="filter-priority"
                className="accent-[var(--accent)]"
                checked={filters.priority === opt.id}
                onChange={() => update({ priority: opt.id })}
              />
              <span
                className="text-sm"
                style={{ color: "var(--text-main)" }}
              >
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Okres */}
      <section>
        <h3
          className="text-[11px] uppercase font-semibold mb-2 tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Okres
        </h3>
        <div className="space-y-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-white/[0.04]"
            >
              <input
                type="radio"
                name="filter-period"
                className="accent-[var(--accent)]"
                checked={filters.period === opt.id}
                onChange={() => update({ period: opt.id })}
              />
              <span
                className="text-sm"
                style={{ color: "var(--text-main)" }}
              >
                {opt.label}
              </span>
            </label>
          ))}
        </div>
        {filters.period === "custom" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span
                className="text-[10px] uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                Od
              </span>
              <input
                type="date"
                value={filters.customFrom ?? ""}
                onChange={(e) =>
                  update({ customFrom: e.target.value || null })
                }
                className="px-2 py-1 rounded border text-xs"
                style={{
                  background: "var(--bg-main)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-[10px] uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                Do
              </span>
              <input
                type="date"
                value={filters.customTo ?? ""}
                onChange={(e) => update({ customTo: e.target.value || null })}
                className="px-2 py-1 rounded border text-xs"
                style={{
                  background: "var(--bg-main)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </label>
          </div>
        )}
      </section>

      {/* Wyczyść */}
      <button
        type="button"
        onClick={reset}
        disabled={!isFilterActive(filters)}
        className="mt-auto inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium disabled:opacity-40 hover:bg-white/[0.04]"
        style={{
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Wyczyść filtry
      </button>
    </aside>
  );
}
