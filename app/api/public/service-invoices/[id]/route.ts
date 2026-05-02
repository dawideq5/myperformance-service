export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import { getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { getServiceInvoicesFolderId } from "@/lib/directus-files";
import {
  isConfigured as directusConfigured,
  listItems,
} from "@/lib/directus-cms";

/**
 * Auth proxy dla skanów/zdjęć faktur za komponenty (Wave 20 / Phase 1E).
 *
 * Strumieniuje bytes z Directus `/assets/{id}` używając admin tokena, ale
 * tylko po sprawdzeniu czy caller jest właścicielem zlecenia powiązanego
 * z tym plikiem przez mp_service_components.invoice_file_id.
 *
 * Defence in depth — gdyby ktoś podmienił invoice_file_id w DB na file w
 * innym folderze (np. service-photos), nadal blokujemy serwowanie bytes.
 */

function getDirectusConfig() {
  const baseUrl =
    getOptionalEnv("DIRECTUS_INTERNAL_URL") || getOptionalEnv("DIRECTUS_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

interface ComponentRow {
  service_id: string;
  invoice_file_id: string;
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

  // Match invoice_file_id → component → service_id → ownership.
  let componentRow: ComponentRow | null = null;
  try {
    const rows = await listItems<ComponentRow>("mp_service_components", {
      "filter[invoice_file_id][_eq]": id,
      limit: 1,
    });
    componentRow = rows[0] ?? null;
  } catch {
    /* fall through to 404 */
  }
  if (!componentRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (componentRow.deleted_at) {
    return NextResponse.json({ error: "Gone" }, { status: 410 });
  }

  // Restricted folder check — drugorzędna obrona.
  const folderId = await getServiceInvoicesFolderId();
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

  const service = await getService(componentRow.service_id);
  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reqUrl = new URL(req.url);
  const upstreamQs = new URLSearchParams();
  // PDF nie obsługuje width/height; ale forwardujemy dla obrazów.
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
    upstream.headers.get("content-type") ??
    fileMeta?.type ??
    "application/octet-stream";
  headers.set("content-type", ct);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);
  headers.set("cache-control", "private, max-age=300");
  headers.set("cross-origin-resource-policy", "cross-origin");

  return new Response(upstream.body, { status: 200, headers });
}
