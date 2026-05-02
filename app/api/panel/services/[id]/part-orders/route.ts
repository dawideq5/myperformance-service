export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import {
  createPartOrder,
  listPartOrders,
} from "@/lib/service-part-orders";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-part-orders" });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId))
    return true;
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
  const orders = await listPartOrders(id);
  return NextResponse.json({ orders }, { headers: PANEL_CORS_HEADERS });
}

interface CreateBody {
  partName?: string;
  supplierName?: string;
  courier?: string;
  trackingUrl?: string;
  trackingNumber?: string;
  expectedDeliveryDate?: string;
  notes?: string;
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
  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const partName = body.partName?.trim();
  if (!partName) {
    return NextResponse.json(
      { error: "Pole 'partName' jest wymagane" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  // Tracking URL — minimalna walidacja kształtu.
  const trackingUrl = body.trackingUrl?.trim() || null;
  if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) {
    return NextResponse.json(
      { error: "trackingUrl musi zaczynać się od http(s)://" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  let order;
  try {
    order = await createPartOrder({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      partName,
      supplierName: body.supplierName?.trim() || null,
      courier: body.courier?.trim() || null,
      trackingUrl,
      trackingNumber: body.trackingNumber?.trim() || null,
      expectedDeliveryDate: body.expectedDeliveryDate?.trim() || null,
      notes: body.notes?.trim() || null,
      createdByEmail: user.email,
    });
  } catch (err) {
    logger.error("createPartOrder failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Nie udało się utworzyć zamówienia części",
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!order) {
    return NextResponse.json(
      { error: "Directus CMS niedostępny" },
      { status: 503, headers: PANEL_CORS_HEADERS },
    );
  }
  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "part_ordered",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: `Zamówiono część: ${partName}${
      order.supplierName ? ` (${order.supplierName})` : ""
    }`,
    payload: {
      partOrderId: order.id,
      partName: order.partName,
      supplierName: order.supplierName,
      courier: order.courier,
      trackingUrl: order.trackingUrl,
      trackingNumber: order.trackingNumber,
      expectedDeliveryDate: order.expectedDeliveryDate,
    },
  });
  return NextResponse.json(
    { ok: true, order },
    { status: 201, headers: PANEL_CORS_HEADERS },
  );
}
