export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  createProtection,
  listProtections,
  type CreateProtectionInput,
} from "@/lib/protections";

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
  const imei = url.searchParams.get("imei") ?? undefined;
  const protections = await listProtections({
    locationIds: user.locationIds,
    imei,
    limit: Number(url.searchParams.get("limit")) || 100,
  });
  return NextResponse.json({ protections }, { headers: PANEL_CORS_HEADERS });
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
    | Omit<CreateProtectionInput, "soldBy">
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
    const protection = await createProtection({
      ...body,
      soldBy: user.email,
    });
    return NextResponse.json(
      { protection },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
}
