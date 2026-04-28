export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { listPricelist } from "@/lib/pricelist";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

/** Read-only catalog. Auth wymagany (Bearer KC token), ale nie filtrujemy
 * po locationIds — cennik jest wspólny. */
export async function GET(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const items = await listPricelist({ enabledOnly: true });
  return NextResponse.json({ items }, { headers: PANEL_CORS_HEADERS });
}
