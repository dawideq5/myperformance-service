export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import {
  getPartOrder,
  updatePartOrder,
  softDeletePartOrder,
  type PartOrderStatus,
} from "@/lib/service-part-orders";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-part-order-detail" });

const VALID_STATUSES: PartOrderStatus[] = [
  "ordered",
  "shipped",
  "delivered",
  "cancelled",
  "lost",
];

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

interface PatchBody {
  partName?: string;
  supplierName?: string | null;
  courier?: string | null;
  trackingUrl?: string | null;
  trackingNumber?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  status?: PartOrderStatus;
  /** Special: gdy true, ustawia received_at = now() i status = "delivered". */
  markReceived?: boolean;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, orderId } = await params;
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
  const existing = await getPartOrder(orderId);
  if (!existing || existing.serviceId !== id || existing.deletedAt) {
    return NextResponse.json(
      { error: "Part order not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const trackingUrl =
    body.trackingUrl === undefined ? undefined : body.trackingUrl;
  if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) {
    return NextResponse.json(
      { error: "trackingUrl musi zaczynać się od http(s)://" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Nieznany status: ${body.status}` },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const wasReceivedBefore = existing.receivedAt != null;
  let updated;
  try {
    updated = await updatePartOrder(orderId, {
      ...(body.partName !== undefined ? { partName: body.partName } : {}),
      ...(body.supplierName !== undefined
        ? { supplierName: body.supplierName }
        : {}),
      ...(body.courier !== undefined ? { courier: body.courier } : {}),
      ...(trackingUrl !== undefined ? { trackingUrl } : {}),
      ...(body.trackingNumber !== undefined
        ? { trackingNumber: body.trackingNumber }
        : {}),
      ...(body.expectedDeliveryDate !== undefined
        ? { expectedDeliveryDate: body.expectedDeliveryDate }
        : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.markReceived
        ? {
            receivedAt: new Date().toISOString(),
            status: "delivered" as PartOrderStatus,
          }
        : {}),
    });
  } catch (err) {
    logger.error("updatePartOrder failed", {
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Nie udało się zaktualizować zamówienia części",
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!updated) {
    return NextResponse.json(
      { error: "Directus CMS niedostępny" },
      { status: 503, headers: PANEL_CORS_HEADERS },
    );
  }

  // Audit log — różnicujemy "received" od zwykłej edycji.
  const justReceived = !wasReceivedBefore && updated.receivedAt != null;
  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: justReceived ? "part_received" : "part_updated",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: justReceived
      ? `Otrzymano część: ${updated.partName}`
      : `Zaktualizowano zamówienie: ${updated.partName}`,
    payload: {
      partOrderId: updated.id,
      status: updated.status,
      trackingUrl: updated.trackingUrl,
      trackingNumber: updated.trackingNumber,
      receivedAt: updated.receivedAt,
    },
  });
  return NextResponse.json(
    { ok: true, order: updated },
    { headers: PANEL_CORS_HEADERS },
  );
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, orderId } = await params;
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
  const existing = await getPartOrder(orderId);
  if (!existing || existing.serviceId !== id || existing.deletedAt) {
    return NextResponse.json(
      { error: "Part order not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  const ok = await softDeletePartOrder(orderId);
  if (!ok) {
    return NextResponse.json(
      { error: "Nie udało się usunąć zamówienia" },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "part_deleted",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: `Usunięto zamówienie części: ${existing.partName}`,
    payload: { partOrderId: orderId },
  });
  return NextResponse.json({ ok: true }, { headers: PANEL_CORS_HEADERS });
}
