export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import { getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { getServicePhotosFolderId } from "@/lib/directus-files";
import { listItems, isConfigured as directusConfigured } from "@/lib/directus-cms";

/**
 * Auth proxy dla zdjęć zleceń serwisowych. Strumieniuje bytes z Directus
 * `/assets/{id}` używając admin tokena, ale tylko po sprawdzeniu czy
 * caller jest właścicielem zlecenia (przez panel-auth + locationIds).
 *
 * W odróżnieniu od `/api/public/photos/[id]` (zdjęcia punktów — publiczne):
 * tu wymagamy Bearer tokena, bo zdjęcia mogą zawierać IMEI / dane klienta.
 */

function getDirectusConfig() {
  const baseUrl =
    getOptionalEnv("DIRECTUS_INTERNAL_URL") || getOptionalEnv("DIRECTUS_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

interface PhotoRow {
  service_id: string;
  storage_ref: string;
  deleted_at: string | null;
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
  const cfg = getDirectusConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Directus not configured" },
      { status: 503 },
    );
  }
  if (!(await directusConfigured())) {
    return NextResponse.json(
      { error: "Directus not configured" },
      { status: 503 },
    );
  }

  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = rawId.replace(/[^A-Za-z0-9._-]/g, "");
  if (!id || id !== rawId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Match storage_ref → photo row → service_id → ownership.
  let photoRow: PhotoRow | null = null;
  try {
    const rows = await listItems<PhotoRow>("mp_service_photos", {
      "filter[storage_ref][_eq]": id,
      limit: 1,
    });
    photoRow = rows[0] ?? null;
  } catch {
    /* fall through to 404 */
  }
  if (!photoRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (photoRow.deleted_at) {
    return NextResponse.json({ error: "Gone" }, { status: 410 });
  }

  // Restricted folder check — drugorzędna obrona (defence in depth).
  // Gdy ktoś podmieni storage_ref w DB na file w innym folderze, nie
  // chcemy serwować bytes — zwróć 403.
  const folderId = await getServicePhotosFolderId();
  let fileMeta: { folder?: string | null; type?: string } | null = null;
  try {
    const r = await fetch(
      `${cfg.baseUrl}/files/${encodeURIComponent(id)}?fields=id,folder,type`,
      { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store" },
    );
    if (r.ok) {
      const data = (await r.json()) as {
        data?: { folder?: string | null; type?: string };
      };
      fileMeta = data.data ?? null;
    }
  } catch {
    /* ignore — fall through */
  }
  if (folderId && fileMeta && fileMeta.folder !== folderId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = await getService(photoRow.service_id);
  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Forwarduj opcjonalny query (np. ?width=400 dla thumbnail).
  const reqUrl = new URL(req.url);
  const upstreamQs = new URLSearchParams();
  for (const allowed of ["width", "height", "fit", "quality"]) {
    const v = reqUrl.searchParams.get(allowed);
    if (v) upstreamQs.set(allowed, v);
  }
  const qs = upstreamQs.toString();
  const upstreamUrl = `${cfg.baseUrl}/assets/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
  const upstream = await fetch(upstreamUrl, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const ct =
    upstream.headers.get("content-type") ?? fileMeta?.type ?? "image/jpeg";
  headers.set("content-type", ct);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);
  // Krótszy cache niż locations — zdjęcia serwisowe mogą być usuwane przez
  // soft-delete; nie chcemy serwować z cache po DELETE.
  headers.set("cache-control", "private, max-age=300");

  return new Response(upstream.body, { status: 200, headers });
}
