export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import {
  getServicePhoto,
  softDeleteServicePhoto,
} from "@/lib/service-photos";

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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, photoId } = await params;
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

  const photo = await getServicePhoto(photoId);
  if (!photo || photo.serviceId !== id) {
    return NextResponse.json(
      { error: "Photo not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (photo.deletedAt) {
    return NextResponse.json(
      { ok: true, alreadyDeleted: true },
      { headers: PANEL_CORS_HEADERS },
    );
  }

  const ok = await softDeleteServicePhoto(photoId);
  if (!ok) {
    return NextResponse.json(
      { error: "Nie udało się usunąć zdjęcia" },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "photo_deleted",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: `Usunięto zdjęcie (${photo.stage})`,
    payload: {
      photoId,
      filename: photo.filename,
      storageRef: photo.storageRef,
      stage: photo.stage,
    },
  });

  return NextResponse.json({ ok: true }, { headers: PANEL_CORS_HEADERS });
}
