export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  getTransportJob,
  updateTransportJob,
  type UpdateTransportJobInput,
} from "@/lib/transport-jobs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
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
  const existing = await getTransportJob(id);
  if (!existing) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  // Owner: assigned driver albo user z source/destination location.
  const isOwner =
    (existing.assignedDriver &&
      existing.assignedDriver.toLowerCase() === user.email.toLowerCase()) ||
    (existing.sourceLocationId &&
      user.locationIds.includes(existing.sourceLocationId)) ||
    (existing.destinationLocationId &&
      user.locationIds.includes(existing.destinationLocationId));
  if (!isOwner) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  const body = (await req.json().catch(() => null)) as
    | UpdateTransportJobInput
    | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  try {
    const job = await updateTransportJob(id, body);
    return NextResponse.json({ job }, { headers: PANEL_CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
}
