export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  createTransportJob,
  listTransportJobs,
  type CreateTransportJobInput,
  type TransportJobStatus,
} from "@/lib/transport-jobs";

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
  const status = url.searchParams.get("status") as TransportJobStatus | null;
  const scope = url.searchParams.get("scope"); // "driver" lub "location"
  const jobs = await listTransportJobs({
    driverEmail: scope === "driver" ? user.email : undefined,
    locationIds: scope === "driver" ? undefined : user.locationIds,
    status: status ?? undefined,
    limit: Number(url.searchParams.get("limit")) || 100,
  });
  return NextResponse.json({ jobs }, { headers: PANEL_CORS_HEADERS });
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
    | CreateTransportJobInput
    | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  // Source/destination location must be in user's scope (jeśli podane).
  if (
    body.sourceLocationId &&
    !user.locationIds.includes(body.sourceLocationId)
  ) {
    return NextResponse.json(
      { error: "sourceLocationId not in scope" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  try {
    const job = await createTransportJob(body);
    return NextResponse.json({ job }, { headers: PANEL_CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
}
