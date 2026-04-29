export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import { deleteDocument } from "@/lib/documenso";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "paper-signed" });

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

/** Oznacza zlecenie jako podpisane papierowo (ręcznie przez klienta).
 * Jeśli istnieje aktywny dokument Documenso (status sent), unieważnia go
 * przez DELETE /documents/:id — klient nie może już złożyć podpisu
 * elektronicznego (ścieżki nie mogą się duplikować). */
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
  let invalidatedDocId: number | undefined;
  if (cur?.docId && cur.status === "sent") {
    const ok = await deleteDocument(cur.docId);
    if (ok) {
      invalidatedDocId = cur.docId;
      logger.info("documenso doc invalidated by paper sign", {
        serviceId: id,
        docId: cur.docId,
      });
    }
  }

  const employeeName =
    user.name?.trim() || user.preferred_username || user.email;
  try {
    await updateService(id, {
      visualCondition: {
        ...(service.visualCondition ?? {}),
        paperSigned: {
          signedAt: new Date().toISOString(),
          signedBy: employeeName,
          ...(invalidatedDocId ? { invalidatedDocId } : {}),
        },
        // Unieważniamy elektroniczną ścieżkę.
        documenso:
          cur && invalidatedDocId
            ? { ...cur, status: "expired" }
            : cur,
      } as typeof service.visualCondition,
    });
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "other",
      actor: { email: user.email, name: employeeName },
      summary: invalidatedDocId
        ? `Klient podpisał papierowo — elektroniczny dokument #${invalidatedDocId} unieważniony`
        : "Klient podpisał papierowo — bez elektronicznego dokumentu",
      payload: { invalidatedDocId },
    });
    return NextResponse.json(
      { ok: true, invalidatedDocId },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
