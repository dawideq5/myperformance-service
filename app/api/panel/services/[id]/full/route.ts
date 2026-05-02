export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Wave 21 / Faza 1G — hard delete zlecenia z confirm wpisania nazwy.
 *
 * `DELETE /api/panel/services/:id/full` (osobny od istniejącego DELETE
 * /api/panel/services/:id który soft-deletuje). Wymaga:
 *   - Bearer KC token (panel auth)
 *   - userOwns(service, locationIds) — RBAC location
 *   - canDeleteService(realmRoles) — Wave 20 Faza 1G permission flag
 *   - body.confirmText === `usuń zlecenie #${ticketNumber}` (case-insensitive
 *     trim) — UI wymaga wpisania exact phrase
 *
 * Po pozytywnej walidacji deleguje do `deleteServiceCascade()` które usuwa
 * wszystkie powiązane records (photos, components, annexes, actions, ...)
 * i finalnie samo zlecenie. Documenso PDFs są best-effort cleanup.
 *
 * Response: `{ ok: true, deletedCounts }` lub 4xx/5xx z error message.
 */

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, deleteServiceCascade } from "@/lib/services";
import { canDeleteService } from "@/lib/permissions/roles";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-full-delete" });

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

function buildExpectedPhrase(ticketNumber: string | null): string {
  // Spójny wzorzec z UI (DeleteServiceModal). Lower-case + trim po obu
  // stronach żeby skopiowanie z różnymi white-spacami nie blokowało.
  return `usuń zlecenie #${ticketNumber ?? ""}`.toLowerCase().trim();
}

interface DeleteBody {
  confirmText?: string;
}

export async function DELETE(
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
  if (!canDeleteService(user.realmRoles)) {
    return NextResponse.json(
      {
        error:
          "Brak uprawnień do trwałego usuwania zleceń (wymagana rola admin / service_admin).",
      },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  const body = (await req.json().catch(() => null)) as DeleteBody | null;
  const expected = buildExpectedPhrase(existing.ticketNumber);
  const got = (body?.confirmText ?? "").toLowerCase().trim();
  if (!got || got !== expected) {
    return NextResponse.json(
      {
        error: "confirm_text_mismatch",
        message: `Aby potwierdzić, wpisz dokładnie: "usuń zlecenie #${existing.ticketNumber ?? ""}"`,
        expectedFormat: `usuń zlecenie #${existing.ticketNumber ?? ""}`,
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // Pre-flight log (audit trail) — nawet jeśli cascade padnie w połowie,
  // ślad kto inicjował operację zostaje. Best-effort.
  void logServiceAction({
    serviceId: id,
    ticketNumber: existing.ticketNumber,
    action: "other",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: `INICJOWANO trwałe usunięcie zlecenia #${existing.ticketNumber ?? id}`,
    payload: { phase: "init" },
  });

  try {
    const result = await deleteServiceCascade(id);
    logger.warn("service hard-deleted (cascade)", {
      serviceId: id,
      ticketNumber: result.ticketNumber,
      actor: user.email,
      counts: result.counts,
    });
    return NextResponse.json(
      {
        ok: true,
        ticketNumber: result.ticketNumber,
        deletedCounts: result.counts,
      },
      { status: 200, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("service cascade delete failed", {
      serviceId: id,
      actor: user.email,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
    return NextResponse.json(
      {
        error: "cascade_failed",
        message:
          "Nie udało się ukończyć usuwania zlecenia. Część rekordów mogła już zostać usunięta — skontaktuj się z administratorem.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
