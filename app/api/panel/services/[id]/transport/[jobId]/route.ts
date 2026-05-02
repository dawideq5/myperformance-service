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
  cancelTransportJob,
  getTransportJob,
  updateTransportJob,
} from "@/lib/transport-jobs";
import { listLocations } from "@/lib/locations";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-transport-job" });

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

interface PatchBody {
  targetLocationId?: string;
  reason?: string;
  note?: string;
}

/**
 * Edycja istniejącego zlecenia transportu.
 *
 * Walidacja:
 *   - userOwns(service) — serwisant ma cert do source/destination,
 *   - ownership transportu: createdByEmail === user.email LUB user posiada
 *     dostęp do source/destination location (admin punktu),
 *   - status transportu MUSI być `queued` — po pickup'ie (assigned/in_transit)
 *     blokujemy edycję bo trasa już istnieje fizycznie u kierowcy.
 *
 * Side-effects (gdy targetLocationId zmieniony):
 *   - update destination_location + destination_* w transport_jobs,
 *   - service.holdReason = "Transport do innego serwisu: <reason>".
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, jobId } = await params;
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
  const job = await getTransportJob(jobId);
  if (!job || job.serviceId !== id) {
    return NextResponse.json(
      { error: "Transport job not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  // Ownership transportu — twórca albo admin punktu (source/destination).
  const isCreator =
    job.createdByEmail &&
    job.createdByEmail.toLowerCase() === user.email.toLowerCase();
  const isLocationAdmin =
    (job.sourceLocationId && user.locationIds.includes(job.sourceLocationId)) ||
    (job.destinationLocationId &&
      user.locationIds.includes(job.destinationLocationId));
  if (!isCreator && !isLocationAdmin) {
    return NextResponse.json(
      { error: "Forbidden — nie jesteś autorem zlecenia transportu" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  if (job.status !== "queued") {
    return NextResponse.json(
      {
        error:
          "Edycja możliwa tylko dla zleceń w statusie 'queued' (przed odbiorem przez kierowcę)",
        status: job.status,
      },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const targetLocationId = body.targetLocationId?.trim() || undefined;
  const reason = body.reason?.trim() || undefined;
  const note =
    body.note === undefined ? undefined : (body.note.trim() || null);

  // Jeśli zmiana lokalizacji — zwaliduj cel.
  let newDestination: {
    id: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null = null;
  if (targetLocationId && targetLocationId !== job.destinationLocationId) {
    const currentLocationId =
      service.serviceLocationId ?? service.locationId ?? null;
    if (targetLocationId === currentLocationId) {
      return NextResponse.json(
        { error: "Lokalizacja docelowa musi być inna niż obecna" },
        { status: 400, headers: PANEL_CORS_HEADERS },
      );
    }
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
    newDestination = {
      id: target.id,
      name: target.name,
      address: target.address ?? null,
      lat: target.lat ?? null,
      lng: target.lng ?? null,
    };
  }

  let updated;
  try {
    updated = await updateTransportJob(jobId, {
      ...(newDestination
        ? {
            destinationLocationId: newDestination.id,
            destinationAddress: newDestination.address,
            destinationLat: newDestination.lat,
            destinationLng: newDestination.lng,
          }
        : {}),
      ...(reason !== undefined ? { reason } : {}),
      ...(note !== undefined ? { notes: note } : {}),
    });
  } catch (err) {
    logger.error("updateTransportJob failed", {
      jobId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Nie udało się zaktualizować zlecenia transportu",
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  // Sync holdReason gdy reason albo destination zmieniony.
  if (reason !== undefined || newDestination) {
    const finalReason = reason ?? job.reason ?? "edycja zlecenia";
    try {
      await updateService(id, {
        holdReason: `Transport do innego serwisu: ${finalReason}`,
      });
    } catch (err) {
      // Best-effort — service może być w stanie po zmianie statusu, holdReason
      // jest synchronizacyjny.
      logger.warn("updateService(holdReason) failed", {
        serviceId: id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "transport_updated",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: newDestination
      ? `Zmieniono cel transportu na "${newDestination.name}"`
      : `Zaktualizowano zlecenie transportu #${updated.jobNumber}`,
    payload: {
      transportJobId: jobId,
      previousDestinationLocationId: job.destinationLocationId,
      newDestinationLocationId: updated.destinationLocationId,
      reason: updated.reason,
      note: updated.notes,
    },
  });

  return NextResponse.json(
    { ok: true, transportJob: updated },
    { headers: PANEL_CORS_HEADERS },
  );
}

/**
 * Anuluj zlecenie transportu i przywróć status serwisu sprzed wstrzymania.
 *
 * Walidacja:
 *   - status `queued` lub `assigned` (po `in_transit` urządzenie już jest
 *     w drodze — anulowanie wymaga manualnej interwencji + cofnięcia kierowcy).
 *   - ownership: twórca albo admin punktu (source/destination).
 *
 * Side-effects:
 *   - transport.status = cancelled, cancelled_at = now,
 *   - service: status ← previousStatus, previousStatus = null, holdReason = null.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, jobId } = await params;
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
  const job = await getTransportJob(jobId);
  if (!job || job.serviceId !== id) {
    return NextResponse.json(
      { error: "Transport job not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  const isCreator =
    job.createdByEmail &&
    job.createdByEmail.toLowerCase() === user.email.toLowerCase();
  const isLocationAdmin =
    (job.sourceLocationId && user.locationIds.includes(job.sourceLocationId)) ||
    (job.destinationLocationId &&
      user.locationIds.includes(job.destinationLocationId));
  if (!isCreator && !isLocationAdmin) {
    return NextResponse.json(
      { error: "Forbidden — nie jesteś autorem zlecenia transportu" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!["queued", "assigned"].includes(job.status)) {
    return NextResponse.json(
      {
        error:
          "Anulowanie możliwe tylko dla zleceń 'queued' lub 'assigned' (po pickup nie można anulować z UI)",
        status: job.status,
      },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }

  let cancelled;
  try {
    cancelled = await cancelTransportJob(jobId, user.email);
  } catch (err) {
    logger.error("cancelTransportJob failed", {
      jobId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Nie udało się anulować zlecenia transportu",
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  // Restore service status → previousStatus (jeśli było on_hold). Jeśli serwis
  // już zmienił status (rzadkie), zostawiamy current bez zmian.
  let restoredStatus: ServiceStatus | null = null;
  if (service.status === "on_hold" && service.previousStatus) {
    try {
      const prev = service.previousStatus as ServiceStatus;
      await updateService(id, {
        status: prev,
        previousStatus: null,
        holdReason: null,
      });
      restoredStatus = prev;
    } catch (err) {
      if (err instanceof StatusTransitionError) {
        logger.warn("restore previous status blocked by transition matrix", {
          serviceId: id,
          from: err.from,
          to: err.to,
        });
      } else {
        logger.error("updateService restore failed", {
          serviceId: id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } else if (service.status === "on_hold") {
    // on_hold bez previousStatus — wyczyść tylko holdReason. Caller niech
    // ręcznie zmieni status.
    try {
      await updateService(id, { holdReason: null });
    } catch {
      // ignored
    }
  }

  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "transport_cancelled",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: `Anulowano zlecenie transportu #${cancelled.jobNumber}`,
    payload: {
      transportJobId: jobId,
      previousDestinationLocationId: cancelled.destinationLocationId,
      restoredStatus,
    },
  });

  return NextResponse.json(
    { ok: true, restoredStatus, transportJob: cancelled },
    { headers: PANEL_CORS_HEADERS },
  );
}
