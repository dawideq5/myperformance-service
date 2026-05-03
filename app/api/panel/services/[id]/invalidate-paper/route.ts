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

const logger = log.child({ module: "invalidate-paper" });

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
 * "Wersja papierowa / Wersja elektroniczna".
 *
 * Wave 22 / F8 — guard:
 *  - 403 gdy klient już podpisał ręcznie (paperSigned set)
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
  const guard = checkInvalidateGuard(service, "paper", user.realmRoles);
  if (!guard.allowed) {
    if (!force || !guard.canForce) {
      return NextResponse.json(
        { error: guard.reason ?? "Nie można unieważnić dokumentu", code: guard.code },
        { status: 403, headers: PANEL_CORS_HEADERS },
      );
    }
  }

  const cur = service.visualCondition?.documenso;
  const docId = cur?.docId;
  let deletedFromDocumenso = false;
  let docRowDeleted = false;
  if (docId) {
    deletedFromDocumenso = await deleteDocument(docId);
    // Wave 22 / F8 — soft-delete row w `mp_service_documents`. SSE
    // `document_deleted` event auto-refreshuje listę w obu panelach.
    try {
      const row = await findServiceDocumentByDocumensoId(docId);
      if (row) {
        docRowDeleted = await softDeleteServiceDocument(row.id);
      }
    } catch (err) {
      logger.warn("softDeleteServiceDocument failed", {
        serviceId: id,
        documentId: docId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
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
    action: "document_invalidated",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: force && !guard.allowed
      ? `[ADMIN FORCE] Unieważniono ścieżkę papierową${docId ? ` — dokument #${docId}` : ""} (${guard.reason ?? guard.code})`
      : docId
        ? `Unieważniono ścieżkę papierową — dokument #${docId}`
        : "Unieważniono ścieżkę papierową",
    payload: {
      kind: "paper",
      documentId: docId,
      deletedFromDocumenso,
      docRowDeleted,
      force: force && !guard.allowed,
      guardCode: guard.code,
      guardReason: guard.reason,
      serviceStatus: service.status,
    },
  });
  return NextResponse.json(
    { ok: true, invalidatedDocId: docId, forced: force && !guard.allowed },
    { headers: PANEL_CORS_HEADERS },
  );
}
