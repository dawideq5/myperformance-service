import {
  createItem,
  deleteItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "pricelist" });

export type PricelistCategory =
  | "screen"
  | "battery"
  | "water_damage"
  | "logic_board"
  | "port"
  | "protection"
  | "diagnostic"
  | "other"
  | string;

export interface PricelistItem {
  id: string;
  code: string;
  name: string;
  category: PricelistCategory;
  /** FK do mp_repair_types.code. Każda pozycja cennika należy do JEDNEGO
   * repair_type — kategoria w UI = label tego typu naprawy. Pole wymagane
   * dla nowych pozycji; istniejące bez wartości fallbackują przez `code`. */
  repairTypeCode: string | null;
  price: number;
  description: string | null;
  warrantyMonths: number | null;
  durationMinutes: number | null;
  sort: number;
  enabled: boolean;
  /** Marka urządzenia (Apple, Samsung, ...) — null = pasuje do wszystkich. */
  brand: string | null;
  /** Wzorzec modelu (substring lub glob, case-insensitive). null = wszystkie
   * modele danej marki. Np. "iPhone 12" pasuje do "iPhone 12", "iPhone 12 Pro",
   * "iPhone 12 Pro Max". */
  modelPattern: string | null;
  /** Slug konkretnego modelu z mp_phone_models — null = pozycja globalna
   * (dotyczy wszystkich modeli pasujących do brand/modelPattern). */
  phoneModelSlug: string | null;
}

interface PricelistRow {
  id: string;
  code: string;
  name: string;
  category: string | null;
  repair_type_code: string | null;
  price: number | string | null;
  description: string | null;
  warranty_months: number | null;
  duration_minutes: number | null;
  sort: number | null;
  enabled: boolean;
  brand: string | null;
  model_pattern: string | null;
  phone_model_slug: string | null;
}

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRow(r: PricelistRow): PricelistItem {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    category: (r.category ?? "other") as PricelistCategory,
    // Fallback: gdy DB nie ma jeszcze repair_type_code (legacy row), używamy
    // `code` jako proxy — w starym schemacie pricelist.code === repair_type.code.
    repairTypeCode: r.repair_type_code?.trim() || r.code || null,
    price: num(r.price),
    description: r.description ?? null,
    warrantyMonths: r.warranty_months ?? null,
    durationMinutes: r.duration_minutes ?? null,
    sort: r.sort ?? 0,
    enabled: r.enabled !== false,
    brand: r.brand?.trim() || null,
    modelPattern: r.model_pattern?.trim() || null,
    phoneModelSlug: r.phone_model_slug?.trim() || null,
  };
}

export async function listPricelist(opts: { enabledOnly?: boolean } = {}): Promise<
  PricelistItem[]
> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    sort: "sort,name",
    limit: 500,
  };
  if (opts.enabledOnly) query["filter[enabled][_eq]"] = "true";
  try {
    const rows = await listItems<PricelistRow>("mp_pricelist", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listPricelist failed", { err: String(err) });
    return [];
  }
}

export interface PricelistInput {
  code: string;
  name: string;
  category: PricelistCategory;
  /** FK do mp_repair_types.code — wymagane dla nowych pozycji. */
  repairTypeCode: string;
  price: number;
  description?: string | null;
  warrantyMonths?: number | null;
  durationMinutes?: number | null;
  sort?: number;
  enabled?: boolean;
  brand?: string | null;
  modelPattern?: string | null;
  /** Konkretny model telefonu (slug z mp_phone_models). null = pozycja
   * globalna pasująca do wszystkich modeli z brand/modelPattern. */
  phoneModelSlug?: string | null;
}

/** Filtruje cennik po brand+model+phoneModelSlug. Pozycje z brand=null pasują
 * do wszystkich; z brand=X pasują tylko gdy device.brand match (case-i).
 * Model pattern (gdy ustawiony) musi być substring device.model (case-i).
 * phoneModelSlug (gdy ustawiony) musi exact-match device.phoneModelSlug. */
export function matchesPricelist(
  item: PricelistItem,
  device: { brand?: string | null; model?: string | null; phoneModelSlug?: string | null },
): boolean {
  if (!item.enabled) return false;
  const dBrand = (device.brand ?? "").toLowerCase().trim();
  const dModel = (device.model ?? "").toLowerCase().trim();
  const dSlug = (device.phoneModelSlug ?? "").toLowerCase().trim();
  if (item.phoneModelSlug) {
    if (!dSlug || item.phoneModelSlug.toLowerCase() !== dSlug) return false;
  }
  if (item.brand) {
    if (item.brand.toLowerCase() !== dBrand) return false;
  }
  if (item.modelPattern) {
    if (!dModel.includes(item.modelPattern.toLowerCase())) return false;
  }
  return true;
}

export function validatePricelist(input: Partial<PricelistInput>): string[] {
  const errors: string[] = [];
  if (!input.code || !/^[A-Z0-9_]{2,32}$/.test(input.code))
    errors.push("Code: 2-32 znaki, A-Z 0-9 _");
  if (!input.name?.trim()) errors.push("Nazwa wymagana");
  if (!input.repairTypeCode?.trim())
    errors.push("Typ naprawy (repair_type_code) wymagany");
  if (input.price == null || !Number.isFinite(input.price) || input.price < 0)
    errors.push("Cena: liczba >= 0");
  return errors;
}

export async function createPricelistItem(
  input: PricelistInput,
): Promise<PricelistItem> {
  const errors = validatePricelist(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const created = await createItem<PricelistRow>("mp_pricelist", {
    code: input.code,
    name: input.name,
    category: input.category,
    repair_type_code: input.repairTypeCode.trim(),
    price: input.price,
    description: input.description ?? null,
    warranty_months: input.warrantyMonths ?? null,
    duration_minutes: input.durationMinutes ?? null,
    sort: input.sort ?? 0,
    enabled: input.enabled !== false,
    brand: input.brand?.trim() || null,
    model_pattern: input.modelPattern?.trim() || null,
    phone_model_slug: input.phoneModelSlug?.trim() || null,
  });
  return mapRow(created);
}

export async function updatePricelistItem(
  id: string,
  input: Partial<PricelistInput>,
): Promise<PricelistItem> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.repairTypeCode !== undefined)
    patch.repair_type_code = input.repairTypeCode.trim();
  if (input.price !== undefined) patch.price = input.price;
  if (input.description !== undefined) patch.description = input.description;
  if (input.warrantyMonths !== undefined)
    patch.warranty_months = input.warrantyMonths;
  if (input.durationMinutes !== undefined)
    patch.duration_minutes = input.durationMinutes;
  if (input.sort !== undefined) patch.sort = input.sort;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.brand !== undefined) patch.brand = input.brand?.trim() || null;
  if (input.modelPattern !== undefined)
    patch.model_pattern = input.modelPattern?.trim() || null;
  if (input.phoneModelSlug !== undefined)
    patch.phone_model_slug = input.phoneModelSlug?.trim() || null;
  const updated = await updateItem<PricelistRow>("mp_pricelist", id, patch);
  return mapRow(updated);
}

export async function deletePricelistItem(id: string): Promise<void> {
  await deleteItem("mp_pricelist", id);
}

/** Zwraca cenę pozycji o danym `code` z pricelist (np. CLEANING_INTAKE,
 * EXPERTISE) najlepiej dopasowaną do brand+model. Brak dopasowania → null. */
export async function getPricelistPriceByCode(
  code: string,
  device: { brand?: string | null; model?: string | null } = {},
): Promise<number | null> {
  const items = await listPricelist({ enabledOnly: true });
  const matches = items.filter(
    (i) => i.code === code && matchesPricelist(i, device),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const ax = (a.brand ? 1 : 0) + (a.modelPattern ? 1 : 0);
    const bx = (b.brand ? 1 : 0) + (b.modelPattern ? 1 : 0);
    return bx - ax;
  });
  return matches[0]?.price ?? null;
}
