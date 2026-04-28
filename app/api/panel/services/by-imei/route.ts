export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getServiceHistoryByImei, isValidImei } from "@/lib/imei";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

/** GET /api/panel/services/by-imei?imei=... — historia zleceń dla IMEI. */
export async function GET(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const url = new URL(req.url);
  const imei = (url.searchParams.get("imei") ?? "").trim().toUpperCase();
  if (!imei) {
    return NextResponse.json(
      { error: "imei query param required" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const history = await getServiceHistoryByImei(imei);
  return NextResponse.json(
    {
      imei,
      luhnValid: isValidImei(imei),
      history,
      count: history.length,
    },
    { headers: PANEL_CORS_HEADERS },
  );
}
