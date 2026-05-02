export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { uploadServicePhoto } from "@/lib/directus-files";
import {
  createServicePhoto,
  type ServicePhotoStage,
} from "@/lib/service-photos";
import { getService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import { verifyUploadToken } from "@/lib/upload-bridge";
import { log } from "@/lib/logger";

const logger = log.child({ module: "upload-bridge-upload" });

const MAX_FILE_BYTES = 15 * 1024 * 1024;

// CORS — endpoint must be reachable from upload.myperformance.pl (different
// origin than dashboard). We permit any origin because the only credential is
// the signed token in the body; classic Origin checks add no security here.
const PUBLIC_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Oczekiwano multipart/form-data" },
      { status: 400, headers: PUBLIC_CORS_HEADERS },
    );
  }

  const tokenRaw = form.get("token");
  const token = typeof tokenRaw === "string" ? tokenRaw : "";
  const verify = verifyUploadToken(token);
  if (!verify.valid) {
    return NextResponse.json(
      { error: verify.reason },
      { status: 401, headers: PUBLIC_CORS_HEADERS },
    );
  }
  const payload = verify.payload;

  // Rate-limit per token: 30 uploads / 30 min — covers the whole token TTL.
  const rl = rateLimit(`upload-bridge-upload:${payload.nonce}`, {
    capacity: 30,
    refillPerSec: 30 / (30 * 60),
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele uploadów na tym linku — odczekaj chwilę." },
      {
        status: 429,
        headers: {
          ...PUBLIC_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Pole `file` jest wymagane (multipart)." },
      { status: 400, headers: PUBLIC_CORS_HEADERS },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { error: "Pusty plik." },
      { status: 400, headers: PUBLIC_CORS_HEADERS },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `Plik przekracza maksymalny rozmiar ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`,
      },
      { status: 413, headers: PUBLIC_CORS_HEADERS },
    );
  }

  const filename =
    (file as File).name?.toString() || `mobile-upload-${Date.now()}.jpg`;
  const mimeType =
    (file as File).type?.toString() || "application/octet-stream";

  // Ensure the service still exists (token issuance time → upload time gap could
  // span deletion). Skipping this is fine functionally because Directus would
  // accept the file anyway, but we want a clear 404 rather than a dangling row.
  const service = await getService(payload.serviceId);
  if (!service) {
    return NextResponse.json(
      { error: "Zlecenie zostało usunięte." },
      { status: 404, headers: PUBLIC_CORS_HEADERS },
    );
  }

  const stage = payload.stage as ServicePhotoStage;

  try {
    const uploaded = await uploadServicePhoto({
      file,
      filename,
      mimeType,
      serviceId: payload.serviceId,
      stage,
      uploadedBy: payload.uploadedByEmail,
    });
    const created = await createServicePhoto({
      serviceId: payload.serviceId,
      ticketNumber: service.ticketNumber,
      storageKind: "directus",
      storageRef: uploaded.fileId,
      url: uploaded.url,
      thumbnailUrl: uploaded.thumbnailUrl ?? null,
      stage,
      note: "mobile upload",
      uploadedBy: payload.uploadedByEmail,
      filename,
      sizeBytes: file.size,
      contentType: mimeType,
    });

    void logServiceAction({
      serviceId: payload.serviceId,
      ticketNumber: service.ticketNumber,
      action: "photo_uploaded",
      actor: {
        email: payload.uploadedByEmail,
        name: `${payload.uploadedByEmail} (mobile)`,
      },
      summary: `Dodano zdjęcie z urządzenia mobilnego (${stage})`,
      payload: {
        photoId: created?.id ?? null,
        fileId: uploaded.fileId,
        filename,
        stage,
        sizeBytes: file.size,
        source: "upload-bridge",
      },
    });

    return NextResponse.json(
      { photo: created },
      { status: 201, headers: PUBLIC_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("upload-bridge upload failed", {
      serviceId: payload.serviceId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się dodać zdjęcia", detail: String(err) },
      { status: 500, headers: PUBLIC_CORS_HEADERS },
    );
  }
}
