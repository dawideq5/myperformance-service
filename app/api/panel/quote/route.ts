export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { computeQuote } from "@/lib/repair-types";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

/** Compute quote dla wybranych kodów napraw + device. Zwraca lines+total
 * lub `contactServiceman: true` z reason gdy kombinacja wymaga ręcznej
 * wyceny przez serwisanta. */
export async function POST(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  let body: {
    codes?: unknown;
    brand?: unknown;
    model?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const codes = Array.isArray(body.codes)
    ? body.codes.filter((c): c is string => typeof c === "string")
    : [];
  const brand = typeof body.brand === "string" ? body.brand : null;
  const model = typeof body.model === "string" ? body.model : null;
  if (codes.length === 0) {
    return NextResponse.json(
      {
        lines: [],
        total: null,
        contactServiceman: false,
        reason: null,
        combinationErrors: [],
      },
      { headers: PANEL_CORS_HEADERS },
    );
  }
  const quote = await computeQuote(codes, { brand, model });
  return NextResponse.json(quote, { headers: PANEL_CORS_HEADERS });
}
