export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService, updateService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import {
  createQuoteHistoryEntry,
  type QuoteHistoryItem,
} from "@/lib/service-quote-history";
import {
  createServiceAnnex,
  type AnnexAcceptanceMethod,
} from "@/lib/service-annexes";
import { rateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-quote-update" });

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

interface QuoteUpdateBody {
  newAmount: number;
  reason?: string;
  items?: QuoteHistoryItem[];
  /** Gdy true, automatycznie tworzy aneks (acceptance pending). */
  requiresAnnex?: boolean;
  /** Metoda akceptacji aneksu — wymagane gdy requiresAnnex=true. */
  acceptanceMethod?: AnnexAcceptanceMethod;
}

export async function POST(
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

  const rl = rateLimit(`svc-quote-update:${id}:${user.email}`, {
    capacity: 10,
    refillPerSec: 10 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as QuoteUpdateBody | null;
  if (
    !body ||
    typeof body.newAmount !== "number" ||
    !Number.isFinite(body.newAmount) ||
    body.newAmount < 0
  ) {
    return NextResponse.json(
      { error: "Pole `newAmount` jest wymagane (liczba nieujemna)" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (body.requiresAnnex && !body.acceptanceMethod) {
    return NextResponse.json(
      {
        error:
          "Gdy `requiresAnnex` = true, wymagane jest pole `acceptanceMethod` (documenso/phone/email)",
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const oldAmount =
    typeof service.amountEstimate === "number" ? service.amountEstimate : null;
  const newAmount = Number(body.newAmount.toFixed(2));
  const editorName =
    user.name?.trim() || user.preferred_username || user.email;

  try {
    if (!body.requiresAnnex) {
      // Bezpośrednia zmiana wyceny + history entry. Klient nie podpisuje.
      await updateService(id, { amountEstimate: newAmount });
      const entry = await createQuoteHistoryEntry({
        serviceId: id,
        ticketNumber: service.ticketNumber,
        oldAmount,
        newAmount,
        reason: body.reason ?? null,
        items: body.items ?? null,
        annexId: null,
        changedByEmail: user.email,
        changedByName: editorName,
      });
      void logServiceAction({
        serviceId: id,
        ticketNumber: service.ticketNumber,
        action: "quote_changed",
        actor: { email: user.email, name: editorName },
        summary: `Zmiana wyceny: ${oldAmount ?? 0} → ${newAmount} PLN`,
        payload: {
          oldAmount,
          newAmount,
          delta: newAmount - (oldAmount ?? 0),
          reason: body.reason ?? null,
          quoteHistoryId: entry?.id ?? null,
        },
      });
      return NextResponse.json(
        { ok: true, quoteHistory: entry, annex: null },
        { headers: PANEL_CORS_HEADERS },
      );
    }

    // Tworzymy aneks pending — delta zostanie zaaplikowane do amount_estimate
    // dopiero po acceptance. Brief: requiresAnnex inicjuje proces, finalizacja
    // odbywa się przez /annexes/[id]/accept lub Documenso webhook.
    const annexDelta = Number((newAmount - (oldAmount ?? 0)).toFixed(2));
    const annex = await createServiceAnnex({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      deltaAmount: annexDelta,
      reason: body.reason ?? "Aktualizacja wyceny",
      acceptanceMethod: body.acceptanceMethod!,
      createdByEmail: user.email,
      createdByName: editorName,
    });

    // Zapis tylko historii zmiany — nie ruszamy mp_services.amount_estimate
    // dopóki klient nie potwierdzi.
    const entry = await createQuoteHistoryEntry({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      oldAmount,
      newAmount,
      reason: body.reason ?? "Aktualizacja wyceny — aneks pending",
      items: body.items ?? null,
      annexId: annex?.id ?? null,
      changedByEmail: user.email,
      changedByName: editorName,
    });

    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "quote_changed",
      actor: { email: user.email, name: editorName },
      summary: `Aneks utworzony: Δ ${annexDelta} PLN (oczekuje na akceptację)`,
      payload: {
        annexId: annex?.id ?? null,
        oldAmount,
        newAmount,
        delta: annexDelta,
        acceptanceMethod: body.acceptanceMethod,
        quoteHistoryId: entry?.id ?? null,
      },
    });

    return NextResponse.json(
      { ok: true, quoteHistory: entry, annex, requiresAcceptance: true },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("quote-update failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się zaktualizować wyceny", detail: String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
