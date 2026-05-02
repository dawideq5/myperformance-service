export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import {
  markInternalRead,
  type AuthorRole,
} from "@/lib/services/internal-chat";

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

function viewerRoleForService(
  service: {
    assignedTechnician: string | null;
    receivedBy: string | null;
  },
  email: string,
): AuthorRole {
  const e = email.toLowerCase();
  if ((service.assignedTechnician ?? "").toLowerCase() === e) return "service";
  if ((service.receivedBy ?? "").toLowerCase() === e) return "sales";
  return "sales";
}

interface BodyShape {
  viewerRole?: AuthorRole;
}

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

  let body: BodyShape = {};
  try {
    body = (await req.json().catch(() => ({}))) as BodyShape;
  } catch {
    body = {};
  }
  const viewerRole: AuthorRole =
    body.viewerRole === "service" || body.viewerRole === "sales"
      ? body.viewerRole
      : viewerRoleForService(service, user.email);

  const updated = await markInternalRead(id, viewerRole);
  return NextResponse.json(
    { ok: true, updated },
    { headers: PANEL_CORS_HEADERS },
  );
}
