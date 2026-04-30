export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { listLocations, getLocation } from "@/lib/locations";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

/** Zwraca wszystkie aktywne punkty serwisowe (do wyboru jako destination
 * przy intake). Plus info o aktualnym sales locationId pracownika:
 * domyślny serwis (powiązanie sales→service) + requiresTransport flag. */
export async function GET(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const url = new URL(req.url);
  const salesLocationId = url.searchParams.get("salesLocationId");

  const allServices = await listLocations({
    type: "service",
    enabledOnly: true,
  });
  const services = allServices.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    phone: l.phone,
  }));

  let defaultServiceId: string | null = null;
  let requiresTransport = false;
  if (salesLocationId && user.locationIds.includes(salesLocationId)) {
    const sales = await getLocation(salesLocationId);
    if (sales?.type === "sales") {
      defaultServiceId = sales.serviceId;
      requiresTransport = sales.requiresTransport;
    }
  }

  return NextResponse.json(
    { services, defaultServiceId, requiresTransport },
    { headers: PANEL_CORS_HEADERS },
  );
}
