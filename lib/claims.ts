import {
  createItem,
  deleteItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "claims" });

export type ClaimStatus = "new" | "review" | "accepted" | "rejected" | "closed";
export type ClaimDemand = "repair" | "exchange" | "refund" | "discount" | string;

export interface Claim {
  id: string;
  claimNumber: string;
  status: ClaimStatus;
  locationId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  phone: string | null;
  email: string | null;
  productName: string | null;
  purchaseDate: string | null;
  receiptNumber: string | null;
  productValue: number | null;
  defectDescription: string | null;
  customerDemand: ClaimDemand | null;
  receivedBy: string | null;
  photos: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface ClaimRow {
  id: string;
  claim_number: string;
  status: string | null;
  location: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  phone: string | null;
  email: string | null;
  product_name: string | null;
  purchase_date: string | null;
  receipt_number: string | null;
  product_value: number | string | null;
  defect_description: string | null;
  customer_demand: string | null;
  received_by: string | null;
  photos: string[] | string | null;
  created_at: string | null;
  updated_at: string | null;
}

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseStringArray(v: string[] | string | null): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.filter((x) => typeof x === "string");
    } catch {
      /* fall through */
    }
  }
  return [];
}

function mapRow(r: ClaimRow): Claim {
  return {
    id: r.id,
    claimNumber: r.claim_number,
    status: (r.status ?? "new") as ClaimStatus,
    locationId: r.location ?? null,
    customerFirstName: r.customer_first_name ?? null,
    customerLastName: r.customer_last_name ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    productName: r.product_name ?? null,
    purchaseDate: r.purchase_date ?? null,
    receiptNumber: r.receipt_number ?? null,
    productValue: num(r.product_value),
    defectDescription: r.defect_description ?? null,
    customerDemand: (r.customer_demand ?? null) as ClaimDemand | null,
    receivedBy: r.received_by ?? null,
    photos: parseStringArray(r.photos),
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

async function nextClaimNumber(): Promise<string> {
  const now = new Date();
  const prefix = `CLM-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-`;
  try {
    const rows = await listItems<{ claim_number: string }>("mp_claims", {
      "filter[claim_number][_starts_with]": prefix,
      sort: "-claim_number",
      limit: 1,
      fields: "claim_number",
    });
    const last = rows[0]?.claim_number ?? null;
    const lastSeq = last ? Number(last.slice(prefix.length)) : 0;
    return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, "0")}`;
  } catch (err) {
    logger.warn("nextClaimNumber fallback", { err: String(err) });
    return `${prefix}${String(Date.now()).slice(-4)}`;
  }
}

export interface ListClaimsQuery {
  locationIds?: string[];
  status?: ClaimStatus | ClaimStatus[];
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getClaim(id: string): Promise<Claim | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<ClaimRow>("mp_claims", {
      "filter[id][_eq]": id,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getClaim failed", { err: String(err) });
    return null;
  }
}

export async function listClaims(q: ListClaimsQuery = {}): Promise<Claim[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    sort: "-created_at",
    limit: Math.min(q.limit ?? 100, 500),
  };
  if (q.offset) query.offset = q.offset;
  if (q.locationIds?.length) {
    query["filter[location][_in]"] = q.locationIds.join(",");
  }
  if (q.status) {
    const arr = Array.isArray(q.status) ? q.status : [q.status];
    query["filter[status][_in]"] = arr.join(",");
  }
  if (q.search) query.search = q.search;
  try {
    const rows = await listItems<ClaimRow>("mp_claims", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listClaims failed", { err: String(err) });
    return [];
  }
}

export interface CreateClaimInput {
  locationId: string;
  customerFirstName: string;
  customerLastName: string;
  phone?: string | null;
  email?: string | null;
  productName: string;
  purchaseDate?: string | null;
  receiptNumber?: string | null;
  productValue?: number | null;
  defectDescription: string;
  customerDemand?: ClaimDemand | null;
  receivedBy: string;
  photos?: string[];
}

export function validateClaim(input: Partial<CreateClaimInput>): string[] {
  const errors: string[] = [];
  if (!input.locationId) errors.push("locationId required");
  if (!input.customerFirstName?.trim()) errors.push("Imię klienta wymagane");
  if (!input.customerLastName?.trim()) errors.push("Nazwisko klienta wymagane");
  if (!input.productName?.trim()) errors.push("Nazwa produktu wymagana");
  if (!input.defectDescription?.trim())
    errors.push("Opis usterki wymagany");
  if (!input.receivedBy) errors.push("receivedBy required");
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    errors.push("Niepoprawny email");
  return errors;
}

export async function createClaim(input: CreateClaimInput): Promise<Claim> {
  const errors = validateClaim(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const claimNumber = await nextClaimNumber();
  const now = new Date().toISOString();
  const created = await createItem<ClaimRow>("mp_claims", {
    claim_number: claimNumber,
    status: "new",
    location: input.locationId,
    customer_first_name: input.customerFirstName,
    customer_last_name: input.customerLastName,
    phone: input.phone ?? null,
    email: input.email ?? null,
    product_name: input.productName,
    purchase_date: input.purchaseDate ?? null,
    receipt_number: input.receiptNumber ?? null,
    product_value: input.productValue ?? null,
    defect_description: input.defectDescription,
    customer_demand: input.customerDemand ?? null,
    received_by: input.receivedBy,
    photos: (input.photos ?? []).slice(0, 10),
    created_at: now,
    updated_at: now,
  });
  return mapRow(created);
}

export interface UpdateClaimInput {
  status?: ClaimStatus;
  defectDescription?: string;
  customerDemand?: ClaimDemand | null;
  productValue?: number | null;
  photos?: string[];
}

export async function updateClaim(
  id: string,
  input: UpdateClaimInput,
): Promise<Claim> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.status !== undefined) patch.status = input.status;
  if (input.defectDescription !== undefined)
    patch.defect_description = input.defectDescription;
  if (input.customerDemand !== undefined)
    patch.customer_demand = input.customerDemand;
  if (input.productValue !== undefined) patch.product_value = input.productValue;
  if (input.photos !== undefined) patch.photos = input.photos.slice(0, 10);
  const updated = await updateItem<ClaimRow>("mp_claims", id, patch);
  return mapRow(updated);
}

export async function deleteClaim(id: string): Promise<void> {
  await deleteItem("mp_claims", id);
}
