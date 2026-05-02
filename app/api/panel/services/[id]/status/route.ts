export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  canTransition,
  getService,
  updateService,
  StatusTransitionError,
  type ServiceStatus,
  type ServiceTransitionRole,
} from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import { notifyServiceStatusChange } from "@/lib/chatwoot-customer";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-status" });

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

interface PatchStatusBody {
  status?: ServiceStatus;
  note?: string;
  holdReason?: string;
  cancellationReason?: string;
  /** Override roli tranzycji — domyślnie `service`. */
  role?: ServiceTransitionRole;
}

export async function PATCH(
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

  const body = (await req.json().catch(() => null)) as PatchStatusBody | null;
  if (!body || typeof body.status !== "string") {
    return NextResponse.json(
      { error: "Pole `status` jest wymagane" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const from = (existing.status ?? "received") as ServiceStatus;
  const to = body.status as ServiceStatus;
  // Rola: w tej fazie panel-auth nie udostępnia panelType, więc default
  // `service`. Sprzedawca może świadomie wymusić `role: "sales"` z UI
  // wallowanego (gdy decyduje się na tranzycję ready→delivered).
  const role: ServiceTransitionRole = body.role ?? "service";

  if (!canTransition(from, to, role)) {
    return NextResponse.json(
      {
        error: `Niedozwolone przejście statusu: ${from} → ${to}`,
        from,
        to,
        role,
      },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }

  // Walidacja per-status:
  //   on_hold → wymaga holdReason
  //   cancelled / returned_no_repair / rejected_by_customer → opt cancellationReason
  if (to === "on_hold") {
    if (!body.holdReason?.trim()) {
      return NextResponse.json(
        { error: "Pole `holdReason` jest wymagane przy wstrzymaniu zlecenia" },
        { status: 400, headers: PANEL_CORS_HEADERS },
      );
    }
  }

  // Resume z on_hold: bierzemy poprzedni status z `previous_status`. Frontend
  // może przesłać dowolny non-final status — walidacja `canTransition` z `on_hold`
  // już go dopuszcza. Po resume czyścimy previous_status.
  let previousStatusToWrite: ServiceStatus | null | undefined = undefined;
  let holdReasonToWrite: string | null | undefined = undefined;
  if (from === "on_hold" && to !== "on_hold") {
    previousStatusToWrite = null; // clear
    holdReasonToWrite = null; // clear
  }
  if (to === "on_hold" && from !== "on_hold") {
    previousStatusToWrite = from; // remember for resume
    holdReasonToWrite = body.holdReason ?? null;
  }

  try {
    const updated = await updateService(id, {
      status: to,
      ...(previousStatusToWrite !== undefined
        ? { previousStatus: previousStatusToWrite }
        : {}),
      ...(holdReasonToWrite !== undefined
        ? { holdReason: holdReasonToWrite }
        : {}),
      ...(body.cancellationReason !== undefined
        ? { cancellationReason: body.cancellationReason }
        : {}),
    });

    // Audit log
    void logServiceAction({
      serviceId: id,
      ticketNumber: existing.ticketNumber,
      action: "status_change",
      actor: {
        email: user.email,
        name: user.name?.trim() || user.preferred_username || user.email,
      },
      summary: `Zmiana statusu: ${from} → ${to}`,
      payload: {
        from,
        to,
        role,
        note: body.note ?? null,
        holdReason: body.holdReason ?? null,
        cancellationReason: body.cancellationReason ?? null,
      },
    });

    // Powiadomienie klienta — best-effort.
    try {
      await notifyServiceStatusChange({
        conversationId: updated.chatwootConversationId,
        ticketNumber: updated.ticketNumber,
        newStatus: to,
      });
    } catch (err) {
      logger.warn("notify status change failed", {
        serviceId: id,
        err: String(err),
      });
    }

    return NextResponse.json(
      { service: updated },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    if (err instanceof StatusTransitionError) {
      return NextResponse.json(
        { error: err.message, from: err.from, to: err.to },
        { status: 409, headers: PANEL_CORS_HEADERS },
      );
    }
    logger.error("status PATCH failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
}
