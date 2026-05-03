export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import {
  checkInvalidateGuard,
  type InvalidateKind,
} from "@/lib/services/invalidate-guards";

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

/**
 * Wave 22 / F8 — pre-flight check przed wyświetleniem przycisku
 * "Unieważnij" w UI. Zwraca `{ allowed, canForce, reason, code }` żeby
 * panel mógł zdecydować: pokazać przycisk / pokazać disabled-z-tooltipem /
 * pokazać force-dialog dla admina.
 *
 * `?kind=electronic|paper` — wymagany. `electronic` = invalidate-electronic
 * endpoint, `paper` = invalidate-paper endpoint. Spójne z URL endpointów.
 */
export async function GET(
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
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  if (kindParam !== "electronic" && kindParam !== "paper") {
    return NextResponse.json(
      { error: "Wymagany parametr kind=electronic|paper" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const kind: InvalidateKind = kindParam;

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

  const guard = checkInvalidateGuard(service, kind, user.realmRoles);
  return NextResponse.json(
    {
      kind,
      allowed: guard.allowed,
      canForce: guard.canForce,
      reason: guard.reason,
      code: guard.code,
    },
    { headers: PANEL_CORS_HEADERS },
  );
}
