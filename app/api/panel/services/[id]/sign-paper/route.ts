export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "sign-paper" });

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

/** Wersja papierowa — BEZ Documenso. Pracownik klika "Wersja papierowa",
 * backend ustawia status=paper_pending + handover. UI otwiera
 * /api/relay/services/{id}/signed-pdf które renderuje PDF z embed
 * cursive PNG pracownika (z mp_user_signatures). Klient podpisuje
 * ręcznie na wydruku → klik "Podpisano" → status=paper_signed. */
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
  const handoverChoice =
    (url.searchParams.get("handover_choice") as "none" | "items" | null) ?? "none";
  const handoverItems = url.searchParams.get("handover_items") ?? "";

  const existing = service.visualCondition?.documenso;
  if (existing?.docId) {
    return NextResponse.json(
      {
        error:
          "Istnieje już dokument — najpierw unieważnij obecny aby utworzyć nowy.",
        documentId: existing.docId,
        status: existing.status,
      },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }

  const employeeDisplayName =
    user.name?.trim() || user.preferred_username || user.email;

  // Wirtualny dokument bez Documenso. docId=0 jako sentinel — UI traktuje
  // jako "paper-flow" i pobiera PDF z lokalnego receipt endpoint.
  try {
    await updateService(id, {
      visualCondition: {
        ...(service.visualCondition ?? {}),
        employeeSignature: null as unknown as undefined,
        handover: { choice: handoverChoice, items: handoverItems },
        documenso: {
          docId: 0,
          status: "paper_pending",
          sentAt: new Date().toISOString(),
          employeeSignedAt: new Date().toISOString(),
          previousDocIds: [],
          signedPdfUrl: "available",
        },
      } as typeof service.visualCondition,
    });
  } catch (e) {
    logger.warn("paper-flow status persist failed", {
      serviceId: id,
      err: e instanceof Error ? e.message : String(e),
    });
  }

  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "employee_sign",
    actor: { email: user.email, name: employeeDisplayName },
    summary: "Pracownik wystawił wersję papierową do druku",
    payload: { flow: "paper" },
  });

  return NextResponse.json(
    {
      ok: true,
      signedPdfUrl: `/api/relay/services/${encodeURIComponent(id)}/signed-pdf`,
    },
    { status: 200, headers: PANEL_CORS_HEADERS },
  );
}
