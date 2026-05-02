export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { listRepairTypes } from "@/lib/repair-types";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

/** Lista typów napraw dla UI sprzedawcy. Zwraca tylko aktywne. */
export async function GET(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const types = await listRepairTypes({ activeOnly: true });
  return NextResponse.json(
    {
      types: types.map((t) => ({
        code: t.code,
        label: t.label,
        category: t.category,
        icon: t.icon,
        color: t.color,
        description: t.description,
        defaultWarrantyMonths: t.defaultWarrantyMonths,
        timeMin: t.timeMin,
        timeMax: t.timeMax,
        timeUnit: t.timeUnit,
        combinableMode: t.combinableMode,
        combinableWith: t.combinableWith,
        sumsMode: t.sumsMode,
        sumsWith: t.sumsWith,
        sortOrder: t.sortOrder,
      })),
    },
    { headers: PANEL_CORS_HEADERS },
  );
}
