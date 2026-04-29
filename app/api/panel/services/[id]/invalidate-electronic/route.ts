export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import { deleteDocument } from "@/lib/documenso";
import { logServiceAction } from "@/lib/service-actions";

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

/** Unieważnia istniejący podpisany dokument Documenso. Po wywołaniu user
 * może wysłać NOWY dokument (z aktualnymi danymi/kwotą), poprzedni
 * zostaje w previousDocIds jako historyczny ale jest nieważny. */
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
  const cur = service.visualCondition?.documenso;
  if (!cur?.docId) {
    return NextResponse.json(
      { error: "Brak dokumentu do unieważnienia" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const ok = await deleteDocument(cur.docId);
  await updateService(id, {
    visualCondition: {
      ...(service.visualCondition ?? {}),
      documenso: { ...cur, status: "expired" },
    } as typeof service.visualCondition,
  });
  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "other",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: `Unieważniono dokument elektroniczny #${cur.docId}`,
    payload: { documentId: cur.docId, deletedFromDocumenso: ok },
  });
  return NextResponse.json(
    { ok: true, invalidatedDocId: cur.docId },
    { headers: PANEL_CORS_HEADERS },
  );
}
