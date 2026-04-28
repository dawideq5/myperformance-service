export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  getClaim,
  updateClaim,
  type UpdateClaimInput,
} from "@/lib/claims";

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
  const existing = await getClaim(id);
  if (!existing) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!existing.locationId || !user.locationIds.includes(existing.locationId)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  const body = (await req.json().catch(() => null)) as UpdateClaimInput | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  try {
    const claim = await updateClaim(id, body);
    return NextResponse.json({ claim }, { headers: PANEL_CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
}
