export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import { deleteDocument } from "@/lib/documenso";
import { logServiceAction } from "@/lib/service-actions";
import { checkInvalidateGuard } from "@/lib/services/invalidate-guards";
import {
  findServiceDocumentByDocumensoId,
  softDeleteServiceDocument,
} from "@/lib/service-documents";
import { log } from "@/lib/logger";

const logger = log.child({ module: "invalidate-electronic" });

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
 * zostaje w previousDocIds jako historyczny ale jest nieważny.
 *
 * Wave 22 / F8 — guard:
 *  - 403 gdy klient już podpisał (status === "signed")
 *  - 403 gdy zlecenie wyszło poza status `received`
 *  - admin override: `?force=true` (wymaga realm-admin) — audit-logged
 */
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

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const guard = checkInvalidateGuard(service, "electronic", user.realmRoles);
  if (!guard.allowed) {
    if (!force || !guard.canForce) {
      return NextResponse.json(
        { error: guard.reason ?? "Nie można unieważnić dokumentu", code: guard.code },
        { status: 403, headers: PANEL_CORS_HEADERS },
      );
    }
  }

  const cur = service.visualCondition?.documenso;
  if (!cur?.docId) {
    return NextResponse.json(
      { error: "Brak dokumentu do unieważnienia" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const ok = await deleteDocument(cur.docId);
  // Wave 22 / F8 — soft-delete row w `mp_service_documents` żeby
  // DocumentsLibrary (sprzedawca + serwisant) nie pokazywała ghost-rowa
  // wskazującego na nieistniejący dokument w Documenso. SSE
  // `document_deleted` event auto-refreshuje listę w obu panelach.
  let docRowDeleted = false;
  try {
    const row = await findServiceDocumentByDocumensoId(cur.docId);
    if (row) {
      docRowDeleted = await softDeleteServiceDocument(row.id);
    }
  } catch (err) {
    logger.warn("softDeleteServiceDocument failed", {
      serviceId: id,
      documentId: cur.docId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  // Po unieważnieniu: kompletny reset visualCondition.documenso (null =
  // delete-key sentinel przez mergeJsonb). UI traktuje to jak fresh state —
  // user może rozpocząć proces od nowa (papier lub elektroniczny).
  // Historia (ActionsLogCard) nadal pokazuje pełen audit log, w tym info
  // o tym że dokument #cur.docId został unieważniony.
  await updateService(id, {
    visualCondition: {
      ...(service.visualCondition ?? {}),
      documenso: null as unknown as undefined,
    } as typeof service.visualCondition,
  });
  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "document_invalidated",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: force && !guard.allowed
      ? `[ADMIN FORCE] Unieważniono dokument elektroniczny #${cur.docId} (${guard.reason ?? guard.code})`
      : `Unieważniono dokument elektroniczny #${cur.docId}`,
    payload: {
      kind: "electronic",
      documentId: cur.docId,
      deletedFromDocumenso: ok,
      docRowDeleted,
      force: force && !guard.allowed,
      guardCode: guard.code,
      guardReason: guard.reason,
      serviceStatus: service.status,
      previousDocStatus: cur.status,
    },
  });
  return NextResponse.json(
    { ok: true, invalidatedDocId: cur.docId, forced: force && !guard.allowed },
    { headers: PANEL_CORS_HEADERS },
  );
}
