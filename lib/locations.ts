import { listItems, deleteItem, isConfigured as directusConfigured } from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "locations" });

export type LocationType = "sales" | "service";

export interface LocationHours {
  /** Format "HH-HH" lub null gdy zamknięte. */
  mon?: string | null;
  tue?: string | null;
  wed?: string | null;
  thu?: string | null;
  fri?: string | null;
  sat?: string | null;
  sun?: string | null;
  /** Daty (YYYY-MM-DD) w które niedzielnie punkt jest otwarty. */
  sundays_handlowe?: string[];
}

export interface Location {
  id: string;
  name: string;
  warehouseCode: string | null;
  type: LocationType;
  address: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  hours: LocationHours | null;
  photos: string[];
  budgetPlan: number | null;
  /** TYLKO dla type=sales: UUID parent service location. */
  serviceId: string | null;
  /** TYLKO dla type=service: UUID-y podległych sklepów. */
  salesIds: string[];
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

interface DirectusLocationRow {
  id: string;
  name?: string;
  warehouse_code?: string | null;
  type?: string | null;
  address?: string | null;
  lat?: string | number | null;
  lng?: string | number | null;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  hours?: LocationHours | string | null;
  photos?: string[] | string | null;
  budget_plan?: string | number | null;
  service_id?: string | null;
  sales_ids?: string[] | string | null;
  enabled?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "string") {
    if (raw.trim() === "") return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

function mapRow(r: DirectusLocationRow): Location {
  return {
    id: r.id,
    name: r.name ?? "",
    warehouseCode: r.warehouse_code ?? null,
    type: r.type === "service" ? "service" : "sales",
    address: r.address ?? null,
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
    description: r.description ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    hours: parseJson<LocationHours | null>(r.hours, null),
    photos: parseJson<string[]>(r.photos, []).slice(0, 3),
    budgetPlan: r.budget_plan == null ? null : Number(r.budget_plan),
    serviceId: r.service_id ?? null,
    salesIds: parseJson<string[]>(r.sales_ids, []),
    enabled: r.enabled !== false,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

export async function listLocations(opts: {
  enabledOnly?: boolean;
  type?: LocationType;
  ids?: string[];
} = {}): Promise<Location[]> {
  if (!(await directusConfigured())) return [];
  try {
    const query: Record<string, string | number> = {
      sort: "name",
      limit: 500,
    };
    if (opts.enabledOnly !== false) query["filter[enabled][_eq]"] = "true";
    if (opts.type) query["filter[type][_eq]"] = opts.type;
    if (opts.ids && opts.ids.length > 0) {
      query["filter[id][_in]"] = opts.ids.join(",");
    }
    const rows = await listItems<DirectusLocationRow>("mp_locations", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listLocations failed", { err: String(err) });
    return [];
  }
}

export async function getLocation(id: string): Promise<Location | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<DirectusLocationRow>("mp_locations", {
      "filter[id][_eq]": id,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function listLocationsByIds(ids: string[]): Promise<Location[]> {
  if (ids.length === 0) return [];
  return listLocations({ ids, enabledOnly: false });
}

/**
 * Validate business rules:
 *   - sales location: max 1 service_id (null OK)
 *   - service location: sales_ids[] referencują tylko sales locations
 *   - sales nie może mieć sales_ids ustawione
 */
export function validateLocation(loc: Partial<Location>): string[] {
  const errors: string[] = [];
  if (!loc.name || loc.name.trim().length === 0) {
    errors.push("Nazwa jest wymagana");
  }
  if (loc.type === "sales" && loc.salesIds && loc.salesIds.length > 0) {
    errors.push("Punkt sprzedaży nie może mieć przypisanych podległych sklepów");
  }
  if (loc.type === "service" && loc.serviceId) {
    errors.push("Punkt serwisowy nie może mieć przypisanego serwisu (sam jest serwisem)");
  }
  if (loc.lat != null && (loc.lat < -90 || loc.lat > 90)) {
    errors.push("Latitude poza zakresem [-90, 90]");
  }
  if (loc.lng != null && (loc.lng < -180 || loc.lng > 180)) {
    errors.push("Longitude poza zakresem [-180, 180]");
  }
  if (loc.photos && loc.photos.length > 3) {
    errors.push("Maksymalnie 3 zdjęcia");
  }
  return errors;
}

export async function deleteLocation(id: string): Promise<void> {
  await deleteItem("mp_locations", id);
}
