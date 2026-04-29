export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  getService,
  updateService,
  StatusTransitionError,
  type UpdateServiceInput,
} from "@/lib/services";
import {
  diffServiceUpdate,
  recordServiceRevision,
} from "@/lib/service-revisions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-patch" });

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
  return NextResponse.json({ service }, { headers: PANEL_CORS_HEADERS });
}

export async function PATCH(
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
  const existing = await getService(id);
  if (!existing) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(existing, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  const body = (await req.json().catch(() => null)) as UpdateServiceInput | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const diff = diffServiceUpdate(existing, body);
  logger.info("PATCH service", {
    serviceId: id,
    user: user.email,
    fields: Object.keys(body),
    changedFields: Object.keys(diff.changes),
  });
  try {
    const service = await updateService(id, body);
    // Zapisz rewizję — best-effort, błąd nie blokuje update'u.
    void recordServiceRevision({
      service: existing,
      input: body,
      editor: {
        email: user.email,
        name: user.name?.trim() || user.preferred_username || user.email,
      },
    });
    return NextResponse.json(
      {
        service,
        revision: {
          significant: diff.isSignificant,
          summary: diff.summary,
          changedFields: Object.keys(diff.changes),
        },
      },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    if (err instanceof StatusTransitionError) {
      logger.warn("PATCH blocked by transition", {
        serviceId: id,
        from: err.from,
        to: err.to,
      });
      return NextResponse.json(
        { error: err.message, from: err.from, to: err.to },
        { status: 409, headers: PANEL_CORS_HEADERS },
      );
    }
    logger.error("PATCH failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
}
