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
    const service = await createService({ ...body, receivedBy: user.email });
    return NextResponse.json(
      { service },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
}
