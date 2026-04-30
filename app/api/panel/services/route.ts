export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  createService,
  listServices,
  type CreateServiceInput,
  type ServiceStatus,
} from "@/lib/services";
import { getLocation } from "@/lib/locations";
import { createTransportJob } from "@/lib/transport-jobs";
import { log } from "@/lib/logger";

const logger = log.child({ module: "services-create" });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

export async function GET(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ServiceStatus | null;
  const search = url.searchParams.get("search") ?? undefined;
  const services = await listServices({
    locationIds: user.locationIds,
    status: status ?? undefined,
    search,
    limit: Number(url.searchParams.get("limit")) || 100,
  });
  return NextResponse.json({ services }, { headers: PANEL_CORS_HEADERS });
}

export async function POST(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const body = (await req.json().catch(() => null)) as
    | Omit<CreateServiceInput, "receivedBy">
    | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!body.locationId || !user.locationIds.includes(body.locationId)) {
    return NextResponse.json(
      { error: "locationId not in user scope" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  try {
    // Auto-mapowanie serviceLocationId: jeśli sprzedawca nie wybrał innego
    // serwisu, używamy domyślnego z mp_locations.service_id punktu sprzedaży.
    const salesLocation = await getLocation(body.locationId).catch(() => null);
    const defaultServiceLocationId = salesLocation?.serviceId ?? null;
    const finalServiceLocationId =
      body.serviceLocationId ?? defaultServiceLocationId ?? null;
    const service = await createService({
      ...body,
      serviceLocationId: finalServiceLocationId,
      receivedBy: user.email,
    });
    // Transport job: gdy sprzedawca wybrał inny serwis niż domyślny LUB
    // gdy punkt sprzedaży ma flagę requires_transport=true (np. nie ma
    // bezpośredniego połączenia z serwisem). Tworzymy zlecenie odbioru w
    // panelu kierowcy.
    const isCustomService =
      finalServiceLocationId !== defaultServiceLocationId;
    const requiresTransport =
      salesLocation?.requiresTransport === true || isCustomService;
    let transportJobId: string | null = null;
    if (
      requiresTransport &&
      finalServiceLocationId &&
      finalServiceLocationId !== body.locationId
    ) {
      try {
        const job = await createTransportJob({
          kind: "pickup_to_service",
          serviceId: service.id,
          sourceLocationId: body.locationId,
          destinationLocationId: finalServiceLocationId,
          notes: isCustomService
            ? "Wybrano serwis niepowiązany z punktem sprzedaży"
            : "Punkt sprzedaży skonfigurowany z wymogiem transportu",
        });
        transportJobId = job.id;
        logger.info("transport job created on service intake", {
          serviceId: service.id,
          transportJobId,
          isCustomService,
          requiresTransportFlag: salesLocation?.requiresTransport === true,
        });
      } catch (e) {
        logger.warn("createTransportJob failed", {
          serviceId: service.id,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return NextResponse.json(
      {
        service,
        transportJobId,
        defaultServiceLocationId,
        chosenServiceLocationId: finalServiceLocationId,
      },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
}
