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
  price: number;
  description: string | null;
  warrantyMonths: number | null;
  durationMinutes: number | null;
  sort: number;
  enabled: boolean;
}

interface PricelistRow {
  id: string;
  code: string;
  name: string;
  category: string | null;
  price: number | string | null;
  description: string | null;
  warranty_months: number | null;
  duration_minutes: number | null;
  sort: number | null;
  enabled: boolean;
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
    price: num(r.price),
    description: r.description ?? null,
    warrantyMonths: r.warranty_months ?? null,
    durationMinutes: r.duration_minutes ?? null,
    sort: r.sort ?? 0,
    enabled: r.enabled !== false,
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
  price: number;
  description?: string | null;
  warrantyMonths?: number | null;
  durationMinutes?: number | null;
  sort?: number;
  enabled?: boolean;
}

export function validatePricelist(input: Partial<PricelistInput>): string[] {
  const errors: string[] = [];
  if (!input.code || !/^[A-Z0-9_]{2,32}$/.test(input.code))
    errors.push("Code: 2-32 znaki, A-Z 0-9 _");
  if (!input.name?.trim()) errors.push("Nazwa wymagana");
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
    price: input.price,
    description: input.description ?? null,
    warranty_months: input.warrantyMonths ?? null,
    duration_minutes: input.durationMinutes ?? null,
    sort: input.sort ?? 0,
    enabled: input.enabled !== false,
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
  if (input.price !== undefined) patch.price = input.price;
  if (input.description !== undefined) patch.description = input.description;
  if (input.warrantyMonths !== undefined)
    patch.warranty_months = input.warrantyMonths;
  if (input.durationMinutes !== undefined)
    patch.duration_minutes = input.durationMinutes;
  if (input.sort !== undefined) patch.sort = input.sort;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  const updated = await updateItem<PricelistRow>("mp_pricelist", id, patch);
  return mapRow(updated);
}

export async function deletePricelistItem(id: string): Promise<void> {
  await deleteItem("mp_pricelist", id);
}
