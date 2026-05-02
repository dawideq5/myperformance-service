import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";
import { publish } from "@/lib/sse-bus";

const logger = log.child({ module: "service-part-orders" });

/**
 * Zamówione części dla zleceń serwisowych w statusie `awaiting_parts`.
 * Każdy rekord = jedno zamówienie u dostawcy. Service może mieć wiele
 * równoległych zamówień (np. wyświetlacz z hurtowni A + bateria z B).
 *
 * Soft-delete: `deleted_at`. Kasowanie permanentne robione tylko przez
 * Directus admin UI.
 */

export type PartOrderStatus =
  | "ordered"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "lost";

export interface ServicePartOrder {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  partName: string;
  supplierName: string | null;
  courier: string | null;
  trackingUrl: string | null;
  trackingNumber: string | null;
  expectedDeliveryDate: string | null;
  orderedAt: string;
  receivedAt: string | null;
  status: PartOrderStatus;
  notes: string | null;
  createdByEmail: string | null;
  deletedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  part_name: string;
  supplier_name: string | null;
  courier: string | null;
  tracking_url: string | null;
  tracking_number: string | null;
  expected_delivery_date: string | null;
  ordered_at: string;
  received_at: string | null;
  status: string | null;
  notes: string | null;
  created_by_email: string | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function mapRow(r: Row): ServicePartOrder {
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    partName: r.part_name,
    supplierName: r.supplier_name,
    courier: r.courier,
    trackingUrl: r.tracking_url,
    trackingNumber: r.tracking_number,
    expectedDeliveryDate: r.expected_delivery_date,
    orderedAt: r.ordered_at,
    receivedAt: r.received_at,
    status: (r.status ?? "ordered") as PartOrderStatus,
    notes: r.notes,
    createdByEmail: r.created_by_email,
    deletedAt: r.deleted_at,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

export interface CreatePartOrderInput {
  serviceId: string;
  ticketNumber?: string | null;
  partName: string;
  supplierName?: string | null;
  courier?: string | null;
  trackingUrl?: string | null;
  trackingNumber?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  createdByEmail?: string | null;
}

export async function createPartOrder(
  input: CreatePartOrderInput,
): Promise<ServicePartOrder | null> {
  if (!(await directusConfigured())) return null;
  try {
    const now = new Date().toISOString();
    const created = await createItem<Row>("mp_service_part_orders", {
      service_id: input.serviceId,
      ticket_number: input.ticketNumber ?? null,
      part_name: input.partName,
      supplier_name: input.supplierName ?? null,
      courier: input.courier ?? null,
      tracking_url: input.trackingUrl ?? null,
      tracking_number: input.trackingNumber ?? null,
      expected_delivery_date: input.expectedDeliveryDate ?? null,
      notes: input.notes ?? null,
      created_by_email: input.createdByEmail ?? null,
      status: "ordered",
      ordered_at: now,
      created_at: now,
      updated_at: now,
    });
    const mapped = mapRow(created);
    publish({
      type: "service_updated",
      serviceId: input.serviceId,
      payload: {
        kind: "part_ordered",
        partOrderId: mapped.id,
        partName: mapped.partName,
        ticketNumber: mapped.ticketNumber,
      },
    });
    return mapped;
  } catch (err) {
    logger.warn("createPartOrder failed", {
      serviceId: input.serviceId,
      err: String(err),
    });
    throw err;
  }
}

export async function listPartOrders(
  serviceId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<ServicePartOrder[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    "filter[service_id][_eq]": serviceId,
    sort: "-ordered_at",
    limit: 200,
  };
  if (!options.includeDeleted) {
    query["filter[deleted_at][_null]"] = "true";
  }
  try {
    const rows = await listItems<Row>("mp_service_part_orders", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listPartOrders failed", { serviceId, err: String(err) });
    return [];
  }
}

export async function getPartOrder(
  orderId: string,
): Promise<ServicePartOrder | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<Row>("mp_service_part_orders", {
      "filter[id][_eq]": orderId,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getPartOrder failed", { orderId, err: String(err) });
    return null;
  }
}

export interface UpdatePartOrderInput {
  partName?: string;
  supplierName?: string | null;
  courier?: string | null;
  trackingUrl?: string | null;
  trackingNumber?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  status?: PartOrderStatus;
  receivedAt?: string | null;
}

export async function updatePartOrder(
  orderId: string,
  input: UpdatePartOrderInput,
): Promise<ServicePartOrder | null> {
  if (!(await directusConfigured())) return null;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.partName !== undefined) patch.part_name = input.partName;
  if (input.supplierName !== undefined) patch.supplier_name = input.supplierName;
  if (input.courier !== undefined) patch.courier = input.courier;
  if (input.trackingUrl !== undefined) patch.tracking_url = input.trackingUrl;
  if (input.trackingNumber !== undefined)
    patch.tracking_number = input.trackingNumber;
  if (input.expectedDeliveryDate !== undefined)
    patch.expected_delivery_date = input.expectedDeliveryDate;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.status !== undefined) patch.status = input.status;
  if (input.receivedAt !== undefined) patch.received_at = input.receivedAt;
  try {
    const updated = await updateItem<Row>(
      "mp_service_part_orders",
      orderId,
      patch,
    );
    const mapped = mapRow(updated);
    publish({
      type: "service_updated",
      serviceId: mapped.serviceId,
      payload: {
        kind: "part_updated",
        partOrderId: mapped.id,
        status: mapped.status,
        receivedAt: mapped.receivedAt,
      },
    });
    return mapped;
  } catch (err) {
    logger.warn("updatePartOrder failed", { orderId, err: String(err) });
    throw err;
  }
}

export async function softDeletePartOrder(orderId: string): Promise<boolean> {
  if (!(await directusConfigured())) return false;
  try {
    const existing = await getPartOrder(orderId);
    await updateItem("mp_service_part_orders", orderId, {
      deleted_at: new Date().toISOString(),
    });
    if (existing) {
      publish({
        type: "service_updated",
        serviceId: existing.serviceId,
        payload: {
          kind: "part_deleted",
          partOrderId: orderId,
        },
      });
    }
    return true;
  } catch (err) {
    logger.warn("softDeletePartOrder failed", { orderId, err: String(err) });
    return false;
  }
}
