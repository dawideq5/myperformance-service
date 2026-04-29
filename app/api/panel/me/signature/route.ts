export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getUserSignature, upsertUserSignature } from "@/lib/user-signatures";

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
  const sig = await getUserSignature(user.email);
  return NextResponse.json(
    {
      signature: sig
        ? {
            signedName: sig.signedName,
            pngDataUrl: sig.pngDataUrl,
            updatedAt: sig.updatedAt,
          }
        : null,
    },
    { headers: PANEL_CORS_HEADERS },
  );
}

export async function PUT(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const body = (await req.json().catch(() => null)) as {
    pngDataUrl?: string;
    signedName?: string;
  } | null;
  if (!body?.pngDataUrl?.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "Wymagany pngDataUrl (data:image/...)" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (body.pngDataUrl.length > 2_000_000) {
    return NextResponse.json(
      { error: "Podpis za duży (>2MB)" },
      { status: 413, headers: PANEL_CORS_HEADERS },
    );
  }
  const signedName =
    body.signedName?.trim() ||
    user.name?.trim() ||
    user.preferred_username ||
    user.email;
  const sig = await upsertUserSignature({
    userEmail: user.email,
    signedName,
    pngDataUrl: body.pngDataUrl,
  });
  return NextResponse.json(
    { ok: true, signedName: sig?.signedName ?? signedName },
    { headers: PANEL_CORS_HEADERS },
  );
}
