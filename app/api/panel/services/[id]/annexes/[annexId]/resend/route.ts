export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { getServiceAnnex } from "@/lib/service-annexes";
import { resendDocumentReminder } from "@/lib/documenso";
import { logServiceAction } from "@/lib/service-actions";
import { rateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-annex-resend" });

/** POST /annexes/[id]/resend — wysyła Documenso reminder do recipientów
 * pending. Tylko dla aneksów `acceptanceMethod=documenso` w stanie
 * `pending`. Rate limit 1/h per annex (Documenso ma własne anti-spam,
 * ale lepiej dwie warstwy). */

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; annexId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, annexId } = await params;
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
  const annex = await getServiceAnnex(annexId);
  if (!annex || annex.serviceId !== id) {
    return NextResponse.json(
      { error: "Annex not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (annex.acceptanceMethod !== "documenso") {
    return NextResponse.json(
      { error: "Resend dostępny tylko dla aneksów Documenso" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (annex.acceptanceStatus !== "pending") {
    return NextResponse.json(
      {
        error: `Aneks ma status ${annex.acceptanceStatus} — przypomnienie nie ma sensu`,
      },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }
  if (annex.documensoDocId == null) {
    return NextResponse.json(
      { error: "Aneks nie ma przypisanego Documenso doc id" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const rl = rateLimit(`svc-annex-resend:${annexId}`, {
    capacity: 1,
    refillPerSec: 1 / 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit — przypomnienie wysłano w ciągu ostatniej godziny" },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  try {
    const ok = await resendDocumentReminder(annex.documensoDocId);
    if (!ok) {
      return NextResponse.json(
        { error: "Documenso nie zwróciło sukcesu — spróbuj ponownie" },
        { status: 502, headers: PANEL_CORS_HEADERS },
      );
    }
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "annex_resend",
      actor: {
        email: user.email,
        name: user.name?.trim() || user.preferred_username || user.email,
      },
      summary: `Wysłano przypomnienie Documenso dla aneksu (Δ ${annex.deltaAmount} PLN)`,
      payload: {
        annexId,
        documensoDocId: annex.documensoDocId,
      },
    });
    return NextResponse.json({ ok: true }, { headers: PANEL_CORS_HEADERS });
  } catch (err) {
    logger.error("annex resend failed", {
      annexId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Resend failed", detail: String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
