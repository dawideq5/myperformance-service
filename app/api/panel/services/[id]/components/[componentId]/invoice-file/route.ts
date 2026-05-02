/**
 * Komponenty / faktura — upload + download pliku skanu/zdjęcia (Wave 20 / Phase 1E).
 *
 * GET  — strumień pliku (proxy do Directus assets). Panel używa relay
 *        żeby Bearer token poszedł z sesji KC; cross-origin <a href> z direct
 *        public proxy nie działa bo ten wymaga Bearer w nagłówku.
 * POST multipart — uploaduje plik do Directus folder service-invoices
 *        i zapisuje fileId w mp_service_components.invoice_file_id.
 *
 * Limity:
 *   - max 10 MB
 *   - mime: image/jpeg, image/png, application/pdf
 *   - rate limit upload: 10 / 5min per (componentId, user)
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import {
  getServiceInvoicesFolderId,
  uploadServiceInvoice,
} from "@/lib/directus-files";
import {
  getComponent,
  updateComponent,
} from "@/lib/service-components";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-component-invoice-file" });

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"];

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

function getDirectusConfig() {
  const baseUrl =
    getOptionalEnv("DIRECTUS_INTERNAL_URL") || getOptionalEnv("DIRECTUS_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> },
) {
  const cfg = getDirectusConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Directus not configured" },
      { status: 503, headers: PANEL_CORS_HEADERS },
    );
  }
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, componentId } = await params;
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
  const existing = await getComponent(componentId);
  if (!existing || existing.serviceId !== id) {
    return NextResponse.json(
      { error: "Component not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!existing.invoiceFileId) {
    return NextResponse.json(
      { error: "Brak pliku faktury dla tego komponentu" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }

  // Defence in depth — sprawdź folder Directusa.
  const fileId = existing.invoiceFileId;
  const folderId = await getServiceInvoicesFolderId();
  let fileMeta: { folder?: string | null; type?: string } | null = null;
  try {
    const r = await fetch(
      `${cfg.baseUrl}/files/${encodeURIComponent(fileId)}?fields=id,folder,type`,
      { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store" },
    );
    if (r.ok) {
      const data = (await r.json()) as {
        data?: { folder?: string | null; type?: string };
      };
      fileMeta = data.data ?? null;
    }
  } catch {
    /* ignore */
  }
  if (folderId && fileMeta && fileMeta.folder !== folderId) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  const upstream = await fetch(
    `${cfg.baseUrl}/assets/${encodeURIComponent(fileId)}`,
    {
      headers: { Authorization: `Bearer ${cfg.token}` },
      cache: "no-store",
    },
  );
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status}` },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }
  const headers = new Headers();
  const ct =
    upstream.headers.get("content-type") ??
    fileMeta?.type ??
    "application/octet-stream";
  headers.set("content-type", ct);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);
  headers.set("cache-control", "private, max-age=300");
  headers.set("cross-origin-resource-policy", "cross-origin");
  // CORS — pozwala panelowi serwisanta strumieniować bytes przez fetch().
  for (const [k, v] of Object.entries(PANEL_CORS_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(upstream.body, { status: 200, headers });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, componentId } = await params;
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

  const existing = await getComponent(componentId);
  if (!existing || existing.serviceId !== id) {
    return NextResponse.json(
      { error: "Component not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (existing.deletedAt) {
    return NextResponse.json(
      { error: "Component deleted" },
      { status: 410, headers: PANEL_CORS_HEADERS },
    );
  }

  const rl = rateLimit(`svc-component-invoice:${componentId}:${user.email}`, {
    capacity: 10,
    refillPerSec: 10 / (5 * 60),
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
  const mimeType =
    (file as File).type?.toString() || "application/octet-stream";
  if (!ALLOWED_MIME.includes(mimeType)) {
    return NextResponse.json(
      {
        error: `Niedozwolony typ pliku. Dozwolone: ${ALLOWED_MIME.join(", ")}`,
      },
      { status: 415, headers: PANEL_CORS_HEADERS },
    );
  }

  const filename =
    (file as File).name?.toString() || `invoice-${componentId}-${Date.now()}`;

  const actorName =
    user.name?.trim() || user.preferred_username || user.email;

  try {
    const uploaded = await uploadServiceInvoice({
      file,
      filename,
      mimeType,
      serviceId: id,
      componentId,
      uploadedBy: user.email,
    });

    const updated = await updateComponent(componentId, {
      invoiceFileId: uploaded.fileId,
    });

    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "component_updated",
      actor: { email: user.email, name: actorName },
      summary: `Dodano plik faktury do komponentu: ${existing.name}`,
      payload: {
        componentId,
        invoiceFileId: uploaded.fileId,
        filename,
        sizeBytes: file.size,
        mimeType,
      },
    });

    return NextResponse.json(
      {
        component: updated,
        file: { id: uploaded.fileId, url: uploaded.url, filename },
      },
      { status: 201, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("component invoice upload failed", {
      componentId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Nie udało się dodać pliku faktury",
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
