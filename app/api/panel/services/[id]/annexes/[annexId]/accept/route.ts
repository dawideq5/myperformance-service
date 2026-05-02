export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import {
  getServiceAnnex,
  updateServiceAnnex,
} from "@/lib/service-annexes";
import { createQuoteHistoryEntry } from "@/lib/service-quote-history";
import { logServiceAction } from "@/lib/service-actions";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-annex-accept" });

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

interface AcceptBody {
  method: "phone" | "email";
  note?: string;
  messageId?: string;
  conversationId?: number;
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
  if (annex.acceptanceStatus !== "pending") {
    return NextResponse.json(
      {
        error: `Aneks już ma finalny status: ${annex.acceptanceStatus}`,
        currentStatus: annex.acceptanceStatus,
      },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }

  const body = (await req.json().catch(() => null)) as AcceptBody | null;
  if (!body || (body.method !== "phone" && body.method !== "email")) {
    return NextResponse.json(
      { error: "Pole `method` jest wymagane (phone/email)" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!body.note?.trim()) {
    return NextResponse.json(
      {
        error:
          "Pole `note` jest wymagane (audit trail manual acceptance)",
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const editorName =
    user.name?.trim() || user.preferred_username || user.email;

  try {
    const acceptedAt = new Date().toISOString();
    const updated = await updateServiceAnnex(annexId, {
      acceptanceStatus: "accepted",
      acceptedAt,
      messageId: body.messageId ?? annex.messageId,
      conversationId: body.conversationId ?? annex.conversationId,
      note: body.note.trim(),
    });

    // Apply delta do amount_estimate i zapisz quote-history entry.
    const oldAmount =
      typeof service.amountEstimate === "number"
        ? service.amountEstimate
        : 0;
    const newAmount = Number((oldAmount + annex.deltaAmount).toFixed(2));
    await updateService(id, { amountEstimate: newAmount });

    const entry = await createQuoteHistoryEntry({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      oldAmount,
      newAmount,
      reason: `Aneks zaakceptowany (${body.method}): ${annex.reason}`,
      annexId,
      changedByEmail: user.email,
      changedByName: editorName,
    });

    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "annex_accepted",
      actor: { email: user.email, name: editorName },
      summary: `Aneks zaakceptowany (${body.method}) — Δ ${annex.deltaAmount} PLN`,
      payload: {
        annexId,
        method: body.method,
        deltaAmount: annex.deltaAmount,
        oldAmount,
        newAmount,
        quoteHistoryId: entry?.id ?? null,
        messageId: body.messageId ?? null,
      },
    });

    return NextResponse.json(
      { ok: true, annex: updated, quoteHistory: entry },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("annex accept failed", {
      serviceId: id,
      annexId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się zaakceptować aneksu", detail: String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
