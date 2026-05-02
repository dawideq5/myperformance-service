import {
  createItem,
  deleteItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";
import { publish } from "@/lib/sse-bus";

const logger = log.child({ module: "transport-jobs" });

export type TransportJobStatus =
  | "queued"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "cancelled";

export type TransportJobKind =
  | "pickup_to_service"
  | "return_to_customer"
  | "warehouse_transfer";

export interface TransportJob {
  id: string;
  jobNumber: string;
  status: TransportJobStatus;
  kind: TransportJobKind | string;
  serviceId: string | null;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  destinationAddress: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  assignedDriver: string | null;
  scheduledAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  recipientSignature: string | null;
  notes: string | null;
  reason: string | null;
  trackingLink: string | null;
  createdByEmail: string | null;
  cancelledAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface JobRow {
  id: string;
  job_number: string;
  status: string | null;
  kind: string | null;
  service: string | null;
  source_location: string | null;
  destination_location: string | null;
  destination_address: string | null;
  destination_lat: number | string | null;
  destination_lng: number | string | null;
  assigned_driver: string | null;
  scheduled_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  recipient_signature: string | null;
  notes: string | null;
  reason: string | null;
  tracking_link: string | null;
  created_by_email: string | null;
  cancelled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: JobRow): TransportJob {
  return {
    id: r.id,
    jobNumber: r.job_number,
    status: (r.status ?? "queued") as TransportJobStatus,
    kind: (r.kind ?? "pickup_to_service") as TransportJobKind,
    serviceId: r.service ?? null,
    sourceLocationId: r.source_location ?? null,
    destinationLocationId: r.destination_location ?? null,
    destinationAddress: r.destination_address ?? null,
    destinationLat: num(r.destination_lat),
    destinationLng: num(r.destination_lng),
    assignedDriver: r.assigned_driver ?? null,
    scheduledAt: r.scheduled_at ?? null,
    pickedUpAt: r.picked_up_at ?? null,
    deliveredAt: r.delivered_at ?? null,
    recipientSignature: r.recipient_signature ?? null,
    notes: r.notes ?? null,
    reason: r.reason ?? null,
    trackingLink: r.tracking_link ?? null,
    createdByEmail: r.created_by_email ?? null,
    cancelledAt: r.cancelled_at ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

async function nextJobNumber(): Promise<string> {
  const now = new Date();
  const prefix = `TRN-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-`;
  try {
    const rows = await listItems<{ job_number: string }>("mp_transport_jobs", {
      "filter[job_number][_starts_with]": prefix,
      sort: "-job_number",
      limit: 1,
      fields: "job_number",
    });
    const last = rows[0]?.job_number ?? null;
    const lastSeq = last ? Number(last.slice(prefix.length)) : 0;
    return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, "0")}`;
  } catch (err) {
    logger.warn("nextJobNumber fallback", { err: String(err) });
    return `${prefix}${String(Date.now()).slice(-4)}`;
  }
}

export interface ListTransportJobsQuery {
  /** Tylko zlecenia powiązane z tymi punktami (source lub destination). */
  locationIds?: string[];
  driverEmail?: string;
  status?: TransportJobStatus | TransportJobStatus[];
  /** Filter po service ID — zwykle używane do sprawdzenia czy serwis ma
   * aktywny transport (kierowca już zabrał urządzenie). */
  serviceId?: string;
  limit?: number;
  offset?: number;
}

export async function getTransportJob(id: string): Promise<TransportJob | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<JobRow>("mp_transport_jobs", {
      "filter[id][_eq]": id,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getTransportJob failed", { err: String(err) });
    return null;
  }
}

export async function listTransportJobs(
  q: ListTransportJobsQuery = {},
): Promise<TransportJob[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    sort: "-created_at",
    limit: Math.min(q.limit ?? 100, 500),
  };
  if (q.offset) query.offset = q.offset;
  if (q.driverEmail) {
    query["filter[assigned_driver][_eq]"] = q.driverEmail.toLowerCase();
  }
  if (q.locationIds?.length) {
    query["filter[_or][0][source_location][_in]"] = q.locationIds.join(",");
    query["filter[_or][1][destination_location][_in]"] = q.locationIds.join(",");
  }
  if (q.status) {
    const arr = Array.isArray(q.status) ? q.status : [q.status];
    query["filter[status][_in]"] = arr.join(",");
  }
  if (q.serviceId) {
    query["filter[service][_eq]"] = q.serviceId;
  }
  try {
    const rows = await listItems<JobRow>("mp_transport_jobs", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listTransportJobs failed", { err: String(err) });
    return [];
  }
}

export interface CreateTransportJobInput {
  kind: TransportJobKind;
  serviceId?: string | null;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
  destinationAddress?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  assignedDriver?: string | null;
  scheduledAt?: string | null;
  notes?: string | null;
  reason?: string | null;
  trackingLink?: string | null;
  createdByEmail?: string | null;
}

export async function createTransportJob(
  input: CreateTransportJobInput,
): Promise<TransportJob> {
  const jobNumber = await nextJobNumber();
  const now = new Date().toISOString();
  const created = await createItem<JobRow>("mp_transport_jobs", {
    job_number: jobNumber,
    status: input.assignedDriver ? "assigned" : "queued",
    kind: input.kind,
    service: input.serviceId ?? null,
    source_location: input.sourceLocationId ?? null,
    destination_location: input.destinationLocationId ?? null,
    destination_address: input.destinationAddress ?? null,
    destination_lat: input.destinationLat ?? null,
    destination_lng: input.destinationLng ?? null,
    assigned_driver: input.assignedDriver ?? null,
    scheduled_at: input.scheduledAt ?? null,
    notes: input.notes ?? null,
    reason: input.reason ?? null,
    tracking_link: input.trackingLink ?? null,
    created_by_email: input.createdByEmail ?? null,
    created_at: now,
    updated_at: now,
  });
  const mapped = mapRow(created);
  publish({
    type: "transport_job_created",
    serviceId: mapped.serviceId,
    payload: {
      jobId: mapped.id,
      jobNumber: mapped.jobNumber,
      kind: mapped.kind,
      status: mapped.status,
      assignedDriver: mapped.assignedDriver,
    },
  });
  // User-scoped notification do kierowcy (gdy assigned).
  if (mapped.assignedDriver) {
    publish({
      type: "transport_job_created",
      serviceId: null,
      userEmail: mapped.assignedDriver,
      payload: {
        jobId: mapped.id,
        jobNumber: mapped.jobNumber,
        kind: mapped.kind,
      },
    });
  }
  return mapped;
}

export interface UpdateTransportJobInput {
  status?: TransportJobStatus;
  assignedDriver?: string | null;
  scheduledAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  recipientSignature?: string | null;
  notes?: string | null;
  reason?: string | null;
  trackingLink?: string | null;
  destinationLocationId?: string | null;
  destinationAddress?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  cancelledAt?: string | null;
}

export async function updateTransportJob(
  id: string,
  input: UpdateTransportJobInput,
): Promise<TransportJob> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.status !== undefined) patch.status = input.status;
  if (input.assignedDriver !== undefined)
    patch.assigned_driver = input.assignedDriver;
  if (input.scheduledAt !== undefined) patch.scheduled_at = input.scheduledAt;
  if (input.pickedUpAt !== undefined) patch.picked_up_at = input.pickedUpAt;
  if (input.deliveredAt !== undefined) patch.delivered_at = input.deliveredAt;
  if (input.recipientSignature !== undefined)
    patch.recipient_signature = input.recipientSignature;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.reason !== undefined) patch.reason = input.reason;
  if (input.trackingLink !== undefined) patch.tracking_link = input.trackingLink;
  if (input.destinationLocationId !== undefined)
    patch.destination_location = input.destinationLocationId;
  if (input.destinationAddress !== undefined)
    patch.destination_address = input.destinationAddress;
  if (input.destinationLat !== undefined)
    patch.destination_lat = input.destinationLat;
  if (input.destinationLng !== undefined)
    patch.destination_lng = input.destinationLng;
  if (input.cancelledAt !== undefined) patch.cancelled_at = input.cancelledAt;
  const updated = await updateItem<JobRow>("mp_transport_jobs", id, patch);
  const mapped = mapRow(updated);
  publish({
    type: "transport_job_updated",
    serviceId: mapped.serviceId,
    payload: {
      jobId: mapped.id,
      jobNumber: mapped.jobNumber,
      status: mapped.status,
      assignedDriver: mapped.assignedDriver,
      pickedUpAt: mapped.pickedUpAt,
      deliveredAt: mapped.deliveredAt,
      destinationLocationId: mapped.destinationLocationId,
      reason: mapped.reason,
      cancelledAt: mapped.cancelledAt,
    },
  });
  return mapped;
}

/**
 * Anuluje zlecenie transportu — ustawia status=cancelled + cancelled_at=now.
 * Walidacja statusu (queued/assigned only) leży po stronie callera (route).
 */
export async function cancelTransportJob(
  id: string,
  by?: string | null,
): Promise<TransportJob> {
  const now = new Date().toISOString();
  const updated = await updateItem<JobRow>("mp_transport_jobs", id, {
    status: "cancelled",
    cancelled_at: now,
    updated_at: now,
  });
  const mapped = mapRow(updated);
  publish({
    type: "transport_job_updated",
    serviceId: mapped.serviceId,
    payload: {
      jobId: mapped.id,
      jobNumber: mapped.jobNumber,
      status: mapped.status,
      cancelledAt: mapped.cancelledAt,
      cancelledBy: by ?? null,
    },
  });
  return mapped;
}

export async function deleteTransportJob(id: string): Promise<void> {
  await deleteItem("mp_transport_jobs", id);
}
