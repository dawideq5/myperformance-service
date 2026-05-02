export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { searchPhoneModels } from "@/lib/phones";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

/**
 * Panel-side proxy do mp_phone_models search (~150 modeli z curated seed).
 * Używane przez intake (AddServiceTab) PhoneModelPicker — autocomplete.
 */
export async function GET(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? 20);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 20;
  const phones = await searchPhoneModels(q, limit);
  return NextResponse.json(
    {
      phones: phones.map((p) => ({
        brand: p.brand,
        model: p.model,
        slug: p.slug,
        year: p.releaseYear,
      })),
    },
    { headers: { ...PANEL_CORS_HEADERS, "Cache-Control": "no-store" } },
  );
}
