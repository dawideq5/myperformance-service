import type { ServiceStatus } from "./status-meta";

export type FilterPeriod = "7d" | "30d" | "all" | "custom";

export interface FilterState {
  /** Wybrane indywidualne statusy. Pusty zbiór = brak filtra po statusie. */
  statuses: ServiceStatus[];
  /** Wybrane lokacje (id). Pusty zbiór = wszystkie. */
  locations: string[];
  period: FilterPeriod;
  /** Tylko gdy period === "custom". ISO date (YYYY-MM-DD). */
  customFrom?: string | null;
  customTo?: string | null;
  /** Tekstowy search. */
  search: string;
}

export const DEFAULT_FILTERS: FilterState = {
  statuses: [],
  locations: [],
  period: "30d",
  customFrom: null,
  customTo: null,
  search: "",
};

export function isFilterActive(filters: FilterState): boolean {
  return (
    filters.statuses.length > 0 ||
    filters.locations.length > 0 ||
    filters.period !== "30d" ||
    filters.search.trim().length > 0
  );
}
