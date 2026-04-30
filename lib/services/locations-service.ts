// Pure helpers extracted from app/admin/locations/LocationsClient.tsx during faza-3.
// Stateless functions and constant tables only — no React, no I/O, no DOM.

import type { Location, LocationHours, LocationType } from "@/lib/locations";

// ── Stałe i typy ──────────────────────────────────────────────────────────

export const DAY_LABELS: Record<keyof Omit<LocationHours, "sundays_handlowe">, string> = {
  mon: "Poniedziałek",
  tue: "Wtorek",
  wed: "Środa",
  thu: "Czwartek",
  fri: "Piątek",
  sat: "Sobota",
  sun: "Niedziela",
};

export const EMPTY_HOURS: LocationHours = {
  mon: "09-21",
  tue: "09-21",
  wed: "09-21",
  thu: "09-21",
  fri: "09-21",
  sat: "09-21",
  sun: null,
  sundays_handlowe: [],
};

export const MAX_PHOTOS = 3;
export const SALES_LIMIT = 50;

export const PHONE_PREFIXES = [
  { code: "+48", label: "🇵🇱 PL" },
  { code: "+49", label: "🇩🇪 DE" },
  { code: "+44", label: "🇬🇧 UK" },
  { code: "+1", label: "🇺🇸 US" },
  { code: "+33", label: "🇫🇷 FR" },
  { code: "+39", label: "🇮🇹 IT" },
  { code: "+34", label: "🇪🇸 ES" },
  { code: "+420", label: "🇨🇿 CZ" },
  { code: "+421", label: "🇸🇰 SK" },
  { code: "+380", label: "🇺🇦 UA" },
];

export const ACTION_LABELS: Record<string, { label: string; tone: string }> = {
  "panel.entered": { label: "Wejście do panelu", tone: "text-sky-400" },
  "panel.location.selected": {
    label: "Wybór punktu",
    tone: "text-sky-400",
  },
  "panel.exited": { label: "Wyjście z panelu", tone: "text-[var(--text-muted)]" },
  "details.updated": { label: "Edycja danych", tone: "text-amber-400" },
  "details.created": { label: "Utworzenie punktu", tone: "text-emerald-400" },
  "details.deleted": { label: "Usunięcie punktu", tone: "text-red-400" },
  "cert.assigned": { label: "Przypisano certyfikat", tone: "text-emerald-400" },
  "cert.unassigned": { label: "Cofnięto certyfikat", tone: "text-rose-400" },
};

export interface DraftState {
  id?: string;
  name: string;
  warehouseCode: string;
  type: LocationType;
  address: string;
  lat: number | null;
  lng: number | null;
  description: string;
  email: string;
  phone: string;
  hours: LocationHours;
  photos: string[];
  budgetPlan: string;
  serviceId: string;
  salesIds: string[];
  enabled: boolean;
}

export interface NominatimResult {
  displayName: string;
  lat: number;
  lng: number;
}

export interface AuditEntry {
  id: number;
  locationId: string;
  userId: string | null;
  userEmail: string | null;
  actionType: string;
  payload: Record<string, unknown> | null;
  srcIp: string | null;
  ts: string;
}

// ── Konwersje Location ↔ DraftState ───────────────────────────────────────

export function locationToDraft(l: Location): DraftState {
  return {
    id: l.id,
    name: l.name,
    warehouseCode: l.warehouseCode ?? "",
    type: l.type,
    address: l.address ?? "",
    lat: l.lat,
    lng: l.lng,
    description: l.description ?? "",
    email: l.email ?? "",
    phone: l.phone ?? "",
    hours: l.hours ?? EMPTY_HOURS,
    photos: l.photos,
    budgetPlan: l.budgetPlan != null ? String(l.budgetPlan) : "",
    serviceId: l.serviceId ?? "",
    salesIds: l.salesIds,
    enabled: l.enabled,
  };
}

export function emptyDraft(): DraftState {
  return {
    name: "",
    warehouseCode: "",
    type: "sales",
    address: "",
    lat: null,
    lng: null,
    description: "",
    email: "",
    phone: "",
    hours: EMPTY_HOURS,
    photos: [],
    budgetPlan: "",
    serviceId: "",
    salesIds: [],
    enabled: true,
  };
}

/** Zbuduj payload do POST/PUT z DraftState. */
export function draftToPayload(draft: DraftState) {
  return {
    name: draft.name,
    warehouseCode: draft.warehouseCode || null,
    type: draft.type,
    address: draft.address || null,
    lat: draft.lat,
    lng: draft.lng,
    description: draft.description || null,
    email: draft.email || null,
    phone: draft.phone || null,
    hours: draft.hours,
    photos: draft.photos.filter((p) => p.trim().length > 0).slice(0, MAX_PHOTOS),
    budgetPlan: draft.budgetPlan ? Number(draft.budgetPlan) : null,
    serviceId: draft.type === "sales" ? draft.serviceId || null : null,
    salesIds: draft.type === "service" ? draft.salesIds.filter(Boolean) : [],
    enabled: draft.enabled,
  };
}

// ── Filtrowanie listy ─────────────────────────────────────────────────────

export function filterLocations(
  locations: Location[],
  filter: "all" | LocationType,
  query: string,
): Location[] {
  const q = query.trim().toLowerCase();
  return locations
    .filter((l) => filter === "all" || l.type === filter)
    .filter((l) => {
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        (l.warehouseCode ?? "").toLowerCase().includes(q) ||
        (l.address ?? "").toLowerCase().includes(q)
      );
    });
}

export function countByType(locations: Location[]) {
  return {
    all: locations.length,
    sales: locations.filter((l) => l.type === "sales").length,
    service: locations.filter((l) => l.type === "service").length,
  };
}

// ── Coordinate validators ────────────────────────────────────────────────

/** WGS84 latitude is [-90, 90], longitude is [-180, 180]. */
export function isValidCoordinate(
  lat: number | null,
  lng: number | null,
): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// ── Telefon ───────────────────────────────────────────────────────────────

export function splitPhone(value: string): { prefix: string; rest: string } {
  const trimmed = value.trim();
  for (const p of PHONE_PREFIXES) {
    if (trimmed.startsWith(p.code)) {
      return { prefix: p.code, rest: trimmed.slice(p.code.length).trim() };
    }
  }
  return { prefix: "+48", rest: trimmed.replace(/^\+\d+\s*/, "") };
}

// ── Geocoding (Nominatim OSM) ────────────────────────────────────────────

/**
 * Nominatim search dla danego query. Restrykcyjnie limit do PL, zwraca
 * uproszczone NominatimResult[]. Throw'uje ApiRequestError-style err
 * przy non-2xx — caller decyduje czy łapać.
 */
export async function geocodeAddress(
  query: string,
  signal?: AbortSignal,
): Promise<NominatimResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "pl");
  url.searchParams.set("limit", "6");
  url.searchParams.set("accept-language", "pl");
  const res = await fetch(url.toString(), {
    headers: { "Accept-Language": "pl" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Nominatim error: HTTP ${res.status}`);
  }
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;
  return data.map((r) => ({
    displayName: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}
