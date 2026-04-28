import {
  createItem,
  deleteItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "services" });

export type ServiceStatus =
  | "received"
  | "diagnosing"
  | "awaiting_quote"
  | "repairing"
  | "testing"
  | "ready"
  | "delivered"
  | "cancelled"
  | "archived";

export type ServiceType =
  | "phone"
  | "tablet"
  | "laptop"
  | "smartwatch"
  | "headphones"
  | "other";

export type TransportStatus =
  | "none"
  | "pickup_pending"
  | "in_transit_to_service"
  | "delivered_to_service"
  | "return_pending"
  | "in_transit_to_customer"
  | "delivered_to_customer";

export interface ServiceTicket {
  id: string;
  ticketNumber: string;
  status: ServiceStatus;
  locationId: string | null;
  serviceLocationId: string | null;
  type: ServiceType | string | null;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  lockCode: string | null;
  description: string | null;
  diagnosis: string | null;
  amountEstimate: number | null;
  amountFinal: number | null;
  contactPhone: string | null;
  contactEmail: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  photos: string[];
  receivedBy: string | null;
  assignedTechnician: string | null;
  transportStatus: TransportStatus;
  chatwootConversationId: number | null;
  warrantyUntil: string | null;
  promisedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ServiceRow {
  id: string;
  ticket_number: string;
  status: string | null;
  location: string | null;
  service_location: string | null;
  type: string | null;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  lock_code: string | null;
  description: string | null;
  diagnosis: string | null;
  amount_estimate: number | string | null;
  amount_final: number | string | null;
  contact_phone: string | null;
  contact_email: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  photos: string[] | string | null;
  received_by: string | null;
  assigned_technician: string | null;
  transport_status: string | null;
  chatwoot_conversation_id: number | null;
  warranty_until: string | null;
  promised_at: string | null;
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

function mapRow(r: ServiceRow): ServiceTicket {
  return {
    id: r.id,
    ticketNumber: r.ticket_number,
    status: (r.status ?? "received") as ServiceStatus,
    locationId: r.location ?? null,
    serviceLocationId: r.service_location ?? null,
    type: r.type ?? null,
    brand: r.brand ?? null,
    model: r.model ?? null,
    imei: r.imei ?? null,
    color: r.color ?? null,
    lockCode: r.lock_code ?? null,
    description: r.description ?? null,
    diagnosis: r.diagnosis ?? null,
    amountEstimate: num(r.amount_estimate),
    amountFinal: num(r.amount_final),
    contactPhone: r.contact_phone ?? null,
    contactEmail: r.contact_email ?? null,
    customerFirstName: r.customer_first_name ?? null,
    customerLastName: r.customer_last_name ?? null,
    photos: parseStringArray(r.photos),
    receivedBy: r.received_by ?? null,
    assignedTechnician: r.assigned_technician ?? null,
    transportStatus: (r.transport_status ?? "none") as TransportStatus,
    chatwootConversationId: r.chatwoot_conversation_id ?? null,
    warrantyUntil: r.warranty_until ?? null,
    promisedAt: r.promised_at ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

/** Generuje ticket_number `SVC-YYYY-MM-NNNN` — szuka highest w bieżącym miesiącu. */
async function nextTicketNumber(): Promise<string> {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `SVC-${yyyy}-${mm}-`;
  try {
    const rows = await listItems<{ ticket_number: string }>("mp_services", {
      "filter[ticket_number][_starts_with]": prefix,
      sort: "-ticket_number",
      limit: 1,
      fields: "ticket_number",
    });
    const last = rows[0]?.ticket_number ?? null;
    const lastSeq = last ? Number(last.slice(prefix.length)) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
  } catch (err) {
    logger.warn("nextTicketNumber fallback", { err: String(err) });
    return `${prefix}${String(Date.now()).slice(-4)}`;
  }
}

export interface ListServicesQuery {
  /** Tylko zlecenia z tych lokalizacji (panel: locationIds usera). */
  locationIds?: string[];
  status?: ServiceStatus | ServiceStatus[];
  search?: string;
  /** Limit; default 100, max 500. */
  limit?: number;
  offset?: number;
}

export async function listServices(
  q: ListServicesQuery = {},
): Promise<ServiceTicket[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    sort: "-created_at",
    limit: Math.min(q.limit ?? 100, 500),
  };
  if (q.offset) query.offset = q.offset;
  if (q.locationIds?.length) {
    query["filter[_or][0][location][_in]"] = q.locationIds.join(",");
    query["filter[_or][1][service_location][_in]"] = q.locationIds.join(",");
  }
  if (q.status) {
    const arr = Array.isArray(q.status) ? q.status : [q.status];
    query["filter[status][_in]"] = arr.join(",");
  }
  if (q.search) {
    // Directus REST supports `search` for text-search on string columns.
    query.search = q.search;
  }
  try {
    const rows = await listItems<ServiceRow>("mp_services", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listServices failed", { err: String(err) });
    return [];
  }
}

export async function getService(id: string): Promise<ServiceTicket | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<ServiceRow>("mp_services", {
      "filter[id][_eq]": id,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getService failed", { err: String(err) });
    return null;
  }
}

export interface CreateServiceInput {
  locationId: string;
  serviceLocationId?: string | null;
  type?: ServiceType | string | null;
  brand?: string | null;
  model?: string | null;
  imei?: string | null;
  color?: string | null;
  lockCode?: string | null;
  description?: string | null;
  amountEstimate?: number | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  photos?: string[];
  promisedAt?: string | null;
  receivedBy: string;
}

export function validateService(
  input: Partial<CreateServiceInput>,
): string[] {
  const errors: string[] = [];
  if (!input.locationId) errors.push("locationId required");
  if (!input.receivedBy) errors.push("receivedBy required");
  if (
    !input.brand &&
    !input.model &&
    !input.imei &&
    !input.description
  ) {
    errors.push("Wymagane: marka/model/IMEI lub opis usterki");
  }
  if (input.imei && !/^[A-Z0-9]{6,20}$/.test(input.imei.toUpperCase())) {
    errors.push("IMEI: 6-20 znaków, A-Z 0-9");
  }
  if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
    errors.push("Niepoprawny email kontaktowy");
  }
  return errors;
}

export async function createService(
  input: CreateServiceInput,
): Promise<ServiceTicket> {
  const errors = validateService(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const ticketNumber = await nextTicketNumber();
  const now = new Date().toISOString();
  const created = await createItem<ServiceRow>("mp_services", {
    ticket_number: ticketNumber,
    status: "received",
    location: input.locationId,
    service_location: input.serviceLocationId ?? null,
    type: input.type ?? null,
    brand: input.brand ?? null,
    model: input.model ?? null,
    imei: input.imei ? input.imei.toUpperCase() : null,
    color: input.color ?? null,
    lock_code: input.lockCode ?? null,
    description: input.description ?? null,
    amount_estimate: input.amountEstimate ?? null,
    contact_phone: input.contactPhone ?? null,
    contact_email: input.contactEmail ?? null,
    customer_first_name: input.customerFirstName ?? null,
    customer_last_name: input.customerLastName ?? null,
    photos: (input.photos ?? []).slice(0, 10),
    received_by: input.receivedBy,
    transport_status: "none",
    promised_at: input.promisedAt ?? null,
    created_at: now,
    updated_at: now,
  });
  return mapRow(created);
}

export interface UpdateServiceInput {
  status?: ServiceStatus;
  diagnosis?: string | null;
  amountEstimate?: number | null;
  amountFinal?: number | null;
  assignedTechnician?: string | null;
  transportStatus?: TransportStatus;
  chatwootConversationId?: number | null;
  promisedAt?: string | null;
  warrantyUntil?: string | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  photos?: string[];
  serviceLocationId?: string | null;
}

export async function updateService(
  id: string,
  input: UpdateServiceInput,
): Promise<ServiceTicket> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.status !== undefined) patch.status = input.status;
  if (input.diagnosis !== undefined) patch.diagnosis = input.diagnosis;
  if (input.amountEstimate !== undefined)
    patch.amount_estimate = input.amountEstimate;
  if (input.amountFinal !== undefined) patch.amount_final = input.amountFinal;
  if (input.assignedTechnician !== undefined)
    patch.assigned_technician = input.assignedTechnician;
  if (input.transportStatus !== undefined)
    patch.transport_status = input.transportStatus;
  if (input.chatwootConversationId !== undefined)
    patch.chatwoot_conversation_id = input.chatwootConversationId;
  if (input.promisedAt !== undefined) patch.promised_at = input.promisedAt;
  if (input.warrantyUntil !== undefined)
    patch.warranty_until = input.warrantyUntil;
  if (input.customerFirstName !== undefined)
    patch.customer_first_name = input.customerFirstName;
  if (input.customerLastName !== undefined)
    patch.customer_last_name = input.customerLastName;
  if (input.contactPhone !== undefined) patch.contact_phone = input.contactPhone;
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
  if (input.photos !== undefined) patch.photos = input.photos.slice(0, 10);
  if (input.serviceLocationId !== undefined)
    patch.service_location = input.serviceLocationId;
  const updated = await updateItem<ServiceRow>("mp_services", id, patch);
  return mapRow(updated);
}

export async function deleteService(id: string): Promise<void> {
  await deleteItem("mp_services", id);
}
