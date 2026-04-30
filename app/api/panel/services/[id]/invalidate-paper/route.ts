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

/** Unieważnia ścieżkę papierową: usuwa dokument Documenso i czyści
 * paperSigned + documenso w visualCondition. UI wraca do widoku
 * "Wersja papierowa / Wersja elektroniczna". */
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
  const docId = cur?.docId;
  let deletedFromDocumenso = false;
  if (docId) {
    deletedFromDocumenso = await deleteDocument(docId);
  }
  await updateService(id, {
    visualCondition: {
      ...(service.visualCondition ?? {}),
      paperSigned: null as unknown as undefined,
      documenso: null as unknown as undefined,
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
    summary: docId
      ? `Unieważniono ścieżkę papierową — dokument #${docId}`
      : "Unieważniono ścieżkę papierową",
    payload: { documentId: docId, deletedFromDocumenso },
  });
  return NextResponse.json(
    { ok: true, invalidatedDocId: docId },
    { headers: PANEL_CORS_HEADERS },
  );
}
