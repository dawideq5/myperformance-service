import {
  createItem,
  deleteItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "protections" });

export type GlassType = "none" | "standard" | "uv" | "privacy" | "full_3d" | string;

export interface Protection {
  id: string;
  locationId: string | null;
  brand: string | null;
  model: string | null;
  imei: string | null;
  glassType: GlassType;
  extendedWarranty: boolean;
  warrantyMonths: number | null;
  amount: number | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  phone: string | null;
  email: string | null;
  soldBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ProtectionRow {
  id: string;
  location: string | null;
  brand: string | null;
  model: string | null;
  imei: string | null;
  glass_type: string | null;
  extended_warranty: boolean | null;
  warranty_months: number | null;
  amount: number | string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  phone: string | null;
  email: string | null;
  sold_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: ProtectionRow): Protection {
  return {
    id: r.id,
    locationId: r.location ?? null,
    brand: r.brand ?? null,
    model: r.model ?? null,
    imei: r.imei ?? null,
    glassType: (r.glass_type ?? "none") as GlassType,
    extendedWarranty: r.extended_warranty === true,
    warrantyMonths: r.warranty_months ?? null,
    amount: num(r.amount),
    customerFirstName: r.customer_first_name ?? null,
    customerLastName: r.customer_last_name ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    soldBy: r.sold_by ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

export interface ListProtectionsQuery {
  locationIds?: string[];
  imei?: string;
  limit?: number;
  offset?: number;
}

export async function listProtections(
  q: ListProtectionsQuery = {},
): Promise<Protection[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    sort: "-created_at",
    limit: Math.min(q.limit ?? 100, 500),
  };
  if (q.offset) query.offset = q.offset;
  if (q.locationIds?.length) {
    query["filter[location][_in]"] = q.locationIds.join(",");
  }
  if (q.imei) query["filter[imei][_eq]"] = q.imei.toUpperCase();
  try {
    const rows = await listItems<ProtectionRow>("mp_protections", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listProtections failed", { err: String(err) });
    return [];
  }
}

export interface CreateProtectionInput {
  locationId: string;
  brand: string;
  model: string;
  imei: string;
  glassType: GlassType;
  extendedWarranty: boolean;
  warrantyMonths?: number | null;
  amount: number;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  phone?: string | null;
  email?: string | null;
  soldBy: string;
}

export function validateProtection(
  input: Partial<CreateProtectionInput>,
): string[] {
  const errors: string[] = [];
  if (!input.locationId) errors.push("locationId required");
  if (!input.brand?.trim()) errors.push("Marka wymagana");
  if (!input.model?.trim()) errors.push("Model wymagany");
  if (!input.imei?.trim()) errors.push("IMEI wymagany");
  if (input.imei && !/^[A-Z0-9]{6,20}$/.test(input.imei.toUpperCase()))
    errors.push("IMEI: 6-20 znaków A-Z 0-9");
  if (input.amount == null || !Number.isFinite(input.amount))
    errors.push("Kwota wymagana");
  if (!input.soldBy) errors.push("soldBy required");
  return errors;
}

export async function createProtection(
  input: CreateProtectionInput,
): Promise<Protection> {
  const errors = validateProtection(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const now = new Date().toISOString();
  const created = await createItem<ProtectionRow>("mp_protections", {
    location: input.locationId,
    brand: input.brand,
    model: input.model,
    imei: input.imei.toUpperCase(),
    glass_type: input.glassType,
    extended_warranty: input.extendedWarranty,
    warranty_months: input.warrantyMonths ?? null,
    amount: input.amount,
    customer_first_name: input.customerFirstName ?? null,
    customer_last_name: input.customerLastName ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    sold_by: input.soldBy,
    created_at: now,
    updated_at: now,
  });
  return mapRow(created);
}

export async function updateProtection(
  id: string,
  input: Partial<CreateProtectionInput>,
): Promise<Protection> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.brand !== undefined) patch.brand = input.brand;
  if (input.model !== undefined) patch.model = input.model;
  if (input.imei !== undefined) patch.imei = input.imei.toUpperCase();
  if (input.glassType !== undefined) patch.glass_type = input.glassType;
  if (input.extendedWarranty !== undefined)
    patch.extended_warranty = input.extendedWarranty;
  if (input.warrantyMonths !== undefined)
    patch.warranty_months = input.warrantyMonths;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.customerFirstName !== undefined)
    patch.customer_first_name = input.customerFirstName;
  if (input.customerLastName !== undefined)
    patch.customer_last_name = input.customerLastName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  const updated = await updateItem<ProtectionRow>("mp_protections", id, patch);
  return mapRow(updated);
}

export async function deleteProtection(id: string): Promise<void> {
  await deleteItem("mp_protections", id);
}
