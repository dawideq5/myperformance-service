export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  getService,
  updateService,
  StatusTransitionError,
  type ServiceStatus,
} from "@/lib/services";
import {
  createTransportJob,
  listTransportJobs,
} from "@/lib/transport-jobs";
import { listLocations } from "@/lib/locations";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-transport" });

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

interface TransportRequestBody {
  targetLocationId?: string;
  reason?: string;
  note?: string;
}

/**
 * Tworzy zlecenie transportu między dwoma punktami serwisowymi i wstrzymuje
 * naprawę do czasu odbioru przez kierowcę.
 *
 * Body: `{ targetLocationId, reason, note? }`.
 *
 * Walidacja:
 *   - serwisant musi mieć dostęp do bieżącej lokacji zlecenia,
 *   - target NIE może być tą samą lokalizacją co aktualna serviceLocation,
 *   - target musi istnieć i być typu `service`,
 *   - dla zlecenia nie może istnieć aktywny transport (queued / assigned /
 *     in_transit) — w przeciwnym razie 409.
 *
 * Side-effects:
 *   - tworzy mp_transport_jobs (kind=warehouse_transfer, status=queued),
 *   - przełącza status serwisu na on_hold z `previous_status = current` i
 *     `hold_reason = "Transport do innego serwisu: <reason>"`,
 *   - loguje action `transport_requested` w mp_service_actions.
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

  const body = (await req.json().catch(() => null)) as TransportRequestBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const targetLocationId = body.targetLocationId?.trim();
  const reason = body.reason?.trim();
  const note = body.note?.trim() || null;
  if (!targetLocationId) {
    return NextResponse.json(
      { error: "targetLocationId jest wymagane" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "Powód transportu jest wymagany" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // Bieżąca lokacja serwisu — preferujemy jawnie ustawiony serviceLocationId,
  // fallback na locationId (sprzedaż przyjęła zlecenie w punkcie który jest
  // jednocześnie serwisem).
  const currentLocationId =
    service.serviceLocationId ?? service.locationId ?? null;
  if (!currentLocationId) {
    return NextResponse.json(
      { error: "Zlecenie nie ma przypisanej lokalizacji źródłowej" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (targetLocationId === currentLocationId) {
    return NextResponse.json(
      { error: "Lokalizacja docelowa musi być inna niż obecna" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // Walidacja celu — musi istnieć, być aktywny i być typu service.
  const allLocations = await listLocations({ enabledOnly: true });
  const target = allLocations.find((l) => l.id === targetLocationId);
  if (!target) {
    return NextResponse.json(
      { error: "Lokalizacja docelowa nie istnieje lub jest wyłączona" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (target.type !== "service") {
    return NextResponse.json(
      { error: "Lokalizacja docelowa nie jest punktem serwisowym" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // Sprawdź aktywny transport — nie pozwalamy na drugi job dopóki pierwszy
  // nie zostanie zakończony lub anulowany.
  const activeJobs = await listTransportJobs({
    serviceId: id,
    status: ["queued", "assigned", "in_transit"],
    limit: 5,
  });
  if (activeJobs.length > 0) {
    return NextResponse.json(
      {
        error: "Zlecenie ma już aktywny transport",
        transportJobId: activeJobs[0].id,
        transportJobStatus: activeJobs[0].status,
      },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }

  let transportJobId: string;
  try {
    const job = await createTransportJob({
      kind: "warehouse_transfer",
      serviceId: id,
      sourceLocationId: currentLocationId,
      destinationLocationId: targetLocationId,
      destinationAddress: target.address ?? null,
      destinationLat: target.lat ?? null,
      destinationLng: target.lng ?? null,
      notes: note,
      reason,
      createdByEmail: user.email,
    });
    transportJobId = job.id;
  } catch (err) {
    logger.error("createTransportJob failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Nie udało się utworzyć zlecenia transportu",
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  // Przełącz serwis na on_hold z zapisanym poprzednim statusem i powodem.
  // Jeśli serwis już był on_hold (rzadkie ale możliwe), zachowujemy istniejący
  // previous_status żeby resume wracał do właściwego stanu.
  const currentStatus = service.status as ServiceStatus;
  const preservedPrevious =
    currentStatus === "on_hold"
      ? (service.previousStatus as ServiceStatus | null) ?? null
      : currentStatus;
  let updatedService;
  try {
    updatedService = await updateService(id, {
      status: "on_hold",
      previousStatus: preservedPrevious,
      holdReason: `Transport do innego serwisu: ${reason}`,
    });
  } catch (err) {
    if (err instanceof StatusTransitionError) {
      return NextResponse.json(
        { error: err.message, from: err.from, to: err.to },
        { status: 409, headers: PANEL_CORS_HEADERS },
      );
    }
    logger.error("updateService(on_hold) failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Nie udało się wstrzymać zlecenia",
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  // Audit log — best-effort.
  void logServiceAction({
    serviceId: id,
    ticketNumber: updatedService.ticketNumber,
    action: "transport_requested",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: `Wnioskowano transport do "${target.name}": ${reason}`,
    payload: {
      targetLocationId,
      reason,
      note,
      transportJobId,
      sourceLocationId: currentLocationId,
    },
  });

  return NextResponse.json(
    { ok: true, transportJobId, service: updatedService },
    { headers: PANEL_CORS_HEADERS },
  );
}
