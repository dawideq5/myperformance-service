import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "service-photos" });

export type ServicePhotoStage =
  | "intake"
  | "diagnosis"
  | "in_repair"
  | "before_delivery"
  | "other";

export type ServicePhotoStorageKind = "directus" | "minio";

export interface ServicePhoto {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  storageKind: ServicePhotoStorageKind;
  storageRef: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  stage: ServicePhotoStage;
  note: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
  filename: string | null;
  sizeBytes: number | null;
  contentType: string | null;
  deletedAt: string | null;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  storage_kind: string;
  storage_ref: string | null;
  url: string | null;
  thumbnail_url: string | null;
  stage: string;
  note: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  filename: string | null;
  size_bytes: number | string | null;
  content_type: string | null;
  deleted_at: string | null;
}

function mapRow(r: Row): ServicePhoto {
  const sb =
    r.size_bytes == null
      ? null
      : typeof r.size_bytes === "number"
        ? r.size_bytes
        : Number(r.size_bytes);
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    storageKind: (r.storage_kind ?? "directus") as ServicePhotoStorageKind,
    storageRef: r.storage_ref,
    url: r.url,
    thumbnailUrl: r.thumbnail_url,
    stage: (r.stage ?? "intake") as ServicePhotoStage,
    note: r.note,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    filename: r.filename,
    sizeBytes: Number.isFinite(sb ?? NaN) ? (sb as number) : null,
    contentType: r.content_type,
    deletedAt: r.deleted_at,
  };
}

export interface CreateServicePhotoInput {
  serviceId: string;
  ticketNumber?: string | null;
  storageKind?: ServicePhotoStorageKind;
  storageRef: string;
  url: string;
  thumbnailUrl?: string | null;
  stage: ServicePhotoStage;
  note?: string | null;
  uploadedBy: string;
  filename: string;
  sizeBytes?: number | null;
  contentType?: string | null;
}

export async function createServicePhoto(
  input: CreateServicePhotoInput,
): Promise<ServicePhoto | null> {
  if (!(await directusConfigured())) return null;
  try {
    const created = await createItem<Row>("mp_service_photos", {
      service_id: input.serviceId,
      ticket_number: input.ticketNumber ?? null,
      storage_kind: input.storageKind ?? "directus",
      storage_ref: input.storageRef,
      url: input.url,
      thumbnail_url: input.thumbnailUrl ?? null,
      stage: input.stage,
      note: input.note ?? null,
      uploaded_by: input.uploadedBy,
      filename: input.filename,
      size_bytes: input.sizeBytes ?? null,
      content_type: input.contentType ?? null,
    });
    return mapRow(created);
  } catch (err) {
    logger.warn("createServicePhoto failed", {
      serviceId: input.serviceId,
      err: String(err),
    });
    throw err;
  }
}

export async function listServicePhotos(
  serviceId: string,
  options: { stage?: ServicePhotoStage; includeDeleted?: boolean } = {},
): Promise<ServicePhoto[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    "filter[service_id][_eq]": serviceId,
    sort: "-uploaded_at",
    limit: 200,
  };
  if (!options.includeDeleted) {
    query["filter[deleted_at][_null]"] = "true";
  }
  if (options.stage) {
    query["filter[stage][_eq]"] = options.stage;
  }
  try {
    const rows = await listItems<Row>("mp_service_photos", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listServicePhotos failed", {
      serviceId,
      err: String(err),
    });
    return [];
  }
}

export async function getServicePhoto(
  photoId: string,
): Promise<ServicePhoto | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<Row>("mp_service_photos", {
      "filter[id][_eq]": photoId,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getServicePhoto failed", { photoId, err: String(err) });
    return null;
  }
}

export async function softDeleteServicePhoto(
  photoId: string,
): Promise<boolean> {
  if (!(await directusConfigured())) return false;
  try {
    await updateItem("mp_service_photos", photoId, {
      deleted_at: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    logger.warn("softDeleteServicePhoto failed", {
      photoId,
      err: String(err),
    });
    return false;
  }
}
