/**
 * Komponenty użyte w naprawie (Wave 20 / Phase 1E).
 *
 * Każdy komponent (część zamienna / materiał) ma:
 *   - koszt netto + ilość + VAT + cost_gross (computed app-layer)
 *   - hurtownię + numer faktury + rodzaj (faktura/paragon/wz/inny)
 *   - daty zakupu + dostawy
 *   - opcjonalny invoice_file_id (Directus Files folder service-invoices)
 *   - margin_target_pct (opcjonalny target % marży)
 *
 * cost_gross liczone w `mapRow()` po stronie app — Directus REST nie wspiera
 * GENERATED ALWAYS AS (wzór z `mp_service_quote_history.delta`).
 *
 * Soft-delete (deleted_at). Bez FK do mp_services — purge przy delete service
 * realizowany ręcznie tak jak inne kolekcje (mp_service_photos itd.).
 */

import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";
import { publish } from "@/lib/sse-bus";

const logger = log.child({ module: "service-components" });

export type ComponentInvoiceKind = "faktura" | "paragon" | "wz" | "inny";

export const ALLOWED_VAT_RATES: readonly number[] = [0, 5, 8, 23] as const;
export const ALLOWED_INVOICE_KINDS: ComponentInvoiceKind[] = [
  "faktura",
  "paragon",
  "wz",
  "inny",
];

export interface ServiceComponent {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  name: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceKind: ComponentInvoiceKind | null;
  purchaseDate: string | null;
  deliveryDate: string | null;
  costNet: number;
  quantity: number;
  vatRate: number;
  /** Wyliczane app-layer: cost_net * quantity * (1 + vat_rate / 100). */
  costGross: number;
  marginTargetPct: number | null;
  invoiceFileId: string | null;
  notes: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
  createdAt: string;
  deletedAt: string | null;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  name: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_kind: string | null;
  purchase_date: string | null;
  delivery_date: string | null;
  cost_net: number | string | null;
  quantity: number | string | null;
  vat_rate: number | string | null;
  cost_gross?: number | string | null;
  margin_target_pct: number | string | null;
  invoice_file_id: string | null;
  notes: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  created_at: string;
  deleted_at: string | null;
}

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** cost_gross = cost_net * quantity * (1 + vat_rate / 100). 2dp. */
export function computeCostGross(
  costNet: number,
  quantity: number,
  vatRate: number,
): number {
  return round2(costNet * quantity * (1 + vatRate / 100));
}

function mapRow(r: Row): ServiceComponent {
  const costNet = num(r.cost_net, 0);
  const quantity = num(r.quantity, 0);
  const vatRate = num(r.vat_rate, 0);
  // cost_gross zawsze liczone w app layer; nawet jeśli Directus zwróci wartość
  // (np. po przyszłej migracji do GENERATED), trzymamy spójność z compute.
  const costGross = computeCostGross(costNet, quantity, vatRate);
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    name: r.name,
    supplierName: r.supplier_name,
    invoiceNumber: r.invoice_number,
    invoiceKind: (r.invoice_kind as ComponentInvoiceKind | null) ?? null,
    purchaseDate: r.purchase_date,
    deliveryDate: r.delivery_date,
    costNet: round2(costNet),
    quantity,
    vatRate,
    costGross,
    marginTargetPct: numOrNull(r.margin_target_pct),
    invoiceFileId: r.invoice_file_id,
    notes: r.notes,
    createdByEmail: r.created_by_email,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    deletedAt: r.deleted_at,
  };
}

export interface CreateServiceComponentInput {
  serviceId: string;
  ticketNumber?: string | null;
  name: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceKind?: ComponentInvoiceKind | null;
  purchaseDate?: string | null;
  deliveryDate?: string | null;
  costNet: number;
  quantity?: number;
  vatRate?: number;
  marginTargetPct?: number | null;
  invoiceFileId?: string | null;
  notes?: string | null;
  createdByEmail?: string | null;
  createdByName?: string | null;
}

export interface UpdateServiceComponentInput {
  name?: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceKind?: ComponentInvoiceKind | null;
  purchaseDate?: string | null;
  deliveryDate?: string | null;
  costNet?: number;
  quantity?: number;
  vatRate?: number;
  marginTargetPct?: number | null;
  invoiceFileId?: string | null;
  notes?: string | null;
}

function validateCore(input: {
  costNet?: number;
  quantity?: number;
  vatRate?: number;
  marginTargetPct?: number | null;
}): void {
  if (input.costNet != null) {
    if (!Number.isFinite(input.costNet) || input.costNet < 0) {
      throw new Error("cost_net musi być liczbą >= 0");
    }
  }
  if (input.quantity != null) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new Error("quantity musi być liczbą > 0");
    }
  }
  if (input.vatRate != null) {
    if (!ALLOWED_VAT_RATES.includes(input.vatRate)) {
      throw new Error(
        `vat_rate musi być jedną z wartości: ${ALLOWED_VAT_RATES.join(", ")}`,
      );
    }
  }
  if (input.marginTargetPct != null && input.marginTargetPct !== undefined) {
    if (
      !Number.isFinite(input.marginTargetPct) ||
      input.marginTargetPct < -100 ||
      input.marginTargetPct > 1000
    ) {
      throw new Error("margin_target_pct poza dopuszczalnym zakresem");
    }
  }
}

export async function createComponent(
  input: CreateServiceComponentInput,
): Promise<ServiceComponent | null> {
  if (!(await directusConfigured())) return null;
  if (!input.name || !input.name.trim()) {
    throw new Error("Pole `name` jest wymagane");
  }
  validateCore({
    costNet: input.costNet,
    quantity: input.quantity ?? 1,
    vatRate: input.vatRate ?? 23,
    marginTargetPct: input.marginTargetPct ?? null,
  });
  if (input.invoiceKind && !ALLOWED_INVOICE_KINDS.includes(input.invoiceKind)) {
    throw new Error(
      `invoice_kind musi być jedną z: ${ALLOWED_INVOICE_KINDS.join(", ")}`,
    );
  }
  const costNet = round2(input.costNet);
  const quantity = input.quantity ?? 1;
  const vatRate = input.vatRate ?? 23;
  const costGross = computeCostGross(costNet, quantity, vatRate);
  try {
    const created = await createItem<Row>("mp_service_components", {
      service_id: input.serviceId,
      ticket_number: input.ticketNumber ?? null,
      name: input.name.trim(),
      supplier_name: input.supplierName?.trim() || null,
      invoice_number: input.invoiceNumber?.trim() || null,
      invoice_kind: input.invoiceKind ?? null,
      purchase_date: input.purchaseDate ?? null,
      delivery_date: input.deliveryDate ?? null,
      cost_net: costNet,
      quantity,
      vat_rate: vatRate,
      cost_gross: costGross,
      margin_target_pct: input.marginTargetPct ?? null,
      invoice_file_id: input.invoiceFileId ?? null,
      notes: input.notes?.trim() || null,
      created_by_email: input.createdByEmail ?? null,
      created_by_name: input.createdByName ?? null,
    });
    const mapped = mapRow(created);
    publish({
      type: "component_added",
      serviceId: input.serviceId,
      payload: {
        componentId: mapped.id,
        ticketNumber: mapped.ticketNumber,
        name: mapped.name,
        costNet: mapped.costNet,
        costGross: mapped.costGross,
      },
    });
    return mapped;
  } catch (err) {
    logger.warn("createComponent failed", {
      serviceId: input.serviceId,
      err: String(err),
    });
    throw err;
  }
}

export async function listComponents(
  serviceId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<ServiceComponent[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    "filter[service_id][_eq]": serviceId,
    sort: "-created_at",
    limit: 200,
  };
  if (!options.includeDeleted) {
    query["filter[deleted_at][_null]"] = "true";
  }
  try {
    const rows = await listItems<Row>("mp_service_components", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listComponents failed", { serviceId, err: String(err) });
    return [];
  }
}

export async function getComponent(
  componentId: string,
): Promise<ServiceComponent | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<Row>("mp_service_components", {
      "filter[id][_eq]": componentId,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getComponent failed", { componentId, err: String(err) });
    return null;
  }
}

export async function updateComponent(
  componentId: string,
  patch: UpdateServiceComponentInput,
): Promise<ServiceComponent | null> {
  if (!(await directusConfigured())) return null;
  validateCore({
    costNet: patch.costNet,
    quantity: patch.quantity,
    vatRate: patch.vatRate,
    marginTargetPct: patch.marginTargetPct ?? undefined,
  });
  if (patch.invoiceKind && !ALLOWED_INVOICE_KINDS.includes(patch.invoiceKind)) {
    throw new Error(
      `invoice_kind musi być jedną z: ${ALLOWED_INVOICE_KINDS.join(", ")}`,
    );
  }
  // Pobierz istniejące, żeby liczyć cost_gross na pełnych wartościach.
  const existing = await getComponent(componentId);
  if (!existing) return null;

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    if (!patch.name || !patch.name.trim()) {
      throw new Error("Pole `name` nie może być puste");
    }
    update.name = patch.name.trim();
  }
  if (patch.supplierName !== undefined) {
    update.supplier_name = patch.supplierName?.trim() || null;
  }
  if (patch.invoiceNumber !== undefined) {
    update.invoice_number = patch.invoiceNumber?.trim() || null;
  }
  if (patch.invoiceKind !== undefined) {
    update.invoice_kind = patch.invoiceKind;
  }
  if (patch.purchaseDate !== undefined) {
    update.purchase_date = patch.purchaseDate;
  }
  if (patch.deliveryDate !== undefined) {
    update.delivery_date = patch.deliveryDate;
  }
  if (patch.costNet !== undefined) update.cost_net = round2(patch.costNet);
  if (patch.quantity !== undefined) update.quantity = patch.quantity;
  if (patch.vatRate !== undefined) update.vat_rate = patch.vatRate;
  if (patch.marginTargetPct !== undefined) {
    update.margin_target_pct = patch.marginTargetPct;
  }
  if (patch.invoiceFileId !== undefined) {
    update.invoice_file_id = patch.invoiceFileId;
  }
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;

  // Recompute cost_gross (deterministyczny, na podstawie merge'd values).
  const costNet =
    patch.costNet !== undefined ? round2(patch.costNet) : existing.costNet;
  const quantity =
    patch.quantity !== undefined ? patch.quantity : existing.quantity;
  const vatRate =
    patch.vatRate !== undefined ? patch.vatRate : existing.vatRate;
  update.cost_gross = computeCostGross(costNet, quantity, vatRate);

  try {
    const updated = await updateItem<Row>(
      "mp_service_components",
      componentId,
      update,
    );
    const mapped = mapRow(updated);
    publish({
      type: "component_updated",
      serviceId: existing.serviceId,
      payload: {
        componentId,
        ticketNumber: existing.ticketNumber,
        name: mapped.name,
        costNet: mapped.costNet,
        costGross: mapped.costGross,
      },
    });
    return mapped;
  } catch (err) {
    logger.warn("updateComponent failed", { componentId, err: String(err) });
    throw err;
  }
}

export async function softDeleteComponent(
  componentId: string,
): Promise<boolean> {
  if (!(await directusConfigured())) return false;
  try {
    const existing = await getComponent(componentId);
    await updateItem("mp_service_components", componentId, {
      deleted_at: new Date().toISOString(),
    });
    if (existing) {
      publish({
        type: "component_deleted",
        serviceId: existing.serviceId,
        payload: {
          componentId,
          ticketNumber: existing.ticketNumber,
          name: existing.name,
        },
      });
    }
    return true;
  } catch (err) {
    logger.warn("softDeleteComponent failed", {
      componentId,
      err: String(err),
    });
    return false;
  }
}

export interface ComponentsTotals {
  totalCostNet: number;
  totalCostGross: number;
  count: number;
}

export async function sumComponents(
  serviceId: string,
): Promise<ComponentsTotals> {
  const items = await listComponents(serviceId);
  let totalCostNet = 0;
  let totalCostGross = 0;
  for (const c of items) {
    totalCostNet += c.costNet * c.quantity;
    totalCostGross += c.costGross;
  }
  return {
    totalCostNet: round2(totalCostNet),
    totalCostGross: round2(totalCostGross),
    count: items.length,
  };
}
