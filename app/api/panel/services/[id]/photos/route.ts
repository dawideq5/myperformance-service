export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import { uploadServicePhoto } from "@/lib/directus-files";
import {
  createServicePhoto,
  listServicePhotos,
  type ServicePhotoStage,
} from "@/lib/service-photos";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-photos" });

const ALLOWED_STAGES: ServicePhotoStage[] = [
  "intake",
  "diagnosis",
  "in_repair",
  "before_delivery",
  "other",
];

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId)) return true;
  if (
    service.serviceLocationId &&
    locationIds.includes(service.serviceLocationId)
  )
    return true;
  return false;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id } = await params;
  const service = await getService(id);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  const url = new URL(req.url);
  const stageParam = url.searchParams.get("stage");
  const stage =
    stageParam && (ALLOWED_STAGES as string[]).includes(stageParam)
      ? (stageParam as ServicePhotoStage)
      : undefined;

  const photos = await listServicePhotos(id, { stage });
  return NextResponse.json(
    { photos },
    { headers: PANEL_CORS_HEADERS },
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id } = await params;
  const service = await getService(id);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  // Rate limit: 10/min per (serviceId, user).
  const rl = rateLimit(`svc-photos:${id}:${user.email}`, {
    capacity: 10,
    refillPerSec: 10 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — spróbuj ponownie za chwilę" },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Oczekiwano multipart/form-data" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Pole `file` jest wymagane (multipart)" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `Plik przekracza maksymalny rozmiar ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`,
      },
      { status: 413, headers: PANEL_CORS_HEADERS },
    );
  }

  const stageRaw = String(form.get("stage") ?? "intake");
  if (!(ALLOWED_STAGES as string[]).includes(stageRaw)) {
    return NextResponse.json(
      { error: `Niepoprawna wartość stage. Dozwolone: ${ALLOWED_STAGES.join(", ")}` },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const stage = stageRaw as ServicePhotoStage;
  const note = form.get("note");
  const noteStr = typeof note === "string" && note.trim() ? note.trim() : null;
  const filename =
    (file as File).name?.toString() || `service-photo-${Date.now()}`;
  const mimeType =
    (file as File).type?.toString() || "application/octet-stream";

  try {
    const uploaded = await uploadServicePhoto({
      file,
      filename,
      mimeType,
      serviceId: id,
      stage,
      uploadedBy: user.email,
    });
    const created = await createServicePhoto({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      storageKind: "directus",
      storageRef: uploaded.fileId,
      url: uploaded.url,
      thumbnailUrl: uploaded.thumbnailUrl ?? null,
      stage,
      note: noteStr,
      uploadedBy: user.email,
      filename,
      sizeBytes: file.size,
      contentType: mimeType,
    });

    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "photo_uploaded",
      actor: {
        email: user.email,
        name: user.name?.trim() || user.preferred_username || user.email,
      },
      summary: `Dodano zdjęcie (${stage})`,
      payload: {
        photoId: created?.id ?? null,
        fileId: uploaded.fileId,
        filename,
        stage,
        sizeBytes: file.size,
      },
    });

    return NextResponse.json(
      { photo: created },
      { status: 201, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("photo upload failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się dodać zdjęcia", detail: String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
