export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "service-sign" });

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

/** Zapisuje podpis pracownika (PNG data URL z signature pad) do
 * visualCondition.employeeSignature. Wymagany przed wygenerowaniem
 * PDF i wysłaniem elektronicznego potwierdzenia. */
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
  const body = (await req.json().catch(() => null)) as {
    pngDataUrl?: string;
  } | null;
  if (!body?.pngDataUrl?.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "Wymagany pngDataUrl (data:image/...;base64,...)" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (body.pngDataUrl.length > 2_000_000) {
    return NextResponse.json(
      { error: "Podpis za duży (>2MB). Spróbuj ponownie." },
      { status: 413, headers: PANEL_CORS_HEADERS },
    );
  }
  try {
    await updateService(id, {
      visualCondition: {
        ...(service.visualCondition ?? {}),
        employeeSignature: {
          pngDataUrl: body.pngDataUrl,
          signedBy: user.name?.trim() || user.preferred_username || user.email,
          signedAt: new Date().toISOString(),
        },
      } as typeof service.visualCondition,
    });
    logger.info("employee signature saved", {
      serviceId: id,
      bytes: body.pngDataUrl.length,
    });
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "employee_sign",
      actor: {
        email: user.email,
        name: user.name?.trim() || user.preferred_username || user.email,
      },
      summary: "Pracownik podpisał dokument elektronicznie",
      payload: { bytes: body.pngDataUrl.length },
    });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("save signature failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}

/** Usuwa podpis pracownika (np. po edycji która unieważnia poprzedni). */
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
  try {
    const vc = { ...(service.visualCondition ?? {}) } as Record<string, unknown>;
    delete vc.employeeSignature;
    await updateService(id, {
      visualCondition: vc as typeof service.visualCondition,
    });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
