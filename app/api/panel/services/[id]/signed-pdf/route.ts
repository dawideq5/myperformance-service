export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { downloadDocumentPdf } from "@/lib/documenso";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId)) return true;
  if (
    service.serviceLocationId &&
    locationIds.includes(service.serviceLocationId)
  )
    return true;
  return false;
}

export async function GET(
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
  const service = await getService(id);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  const docId = service.visualCondition?.documenso?.docId;
  if (!docId) {
    return NextResponse.json(
      { error: "Brak dokumentu Documenso powiązanego z zleceniem" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  const status = service.visualCondition?.documenso?.status;
  if (status !== "signed") {
    return NextResponse.json(
      {
        error:
          "Dokument nie został jeszcze podpisany przez wszystkie strony.",
      },
      { status: 425, headers: PANEL_CORS_HEADERS },
    );
  }
  const dl = await downloadDocumentPdf(Number(docId));
  if (!dl.ok) {
    return NextResponse.json(
      { error: `Nie udało się pobrać podpisanego dokumentu (${dl.status})` },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }
  const ab = await dl.arrayBuffer();
  return new NextResponse(ab as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Potwierdzenie-podpisane-${service.ticketNumber}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
