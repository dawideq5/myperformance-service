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
  /** @deprecated Wave 20 — frontend nie wysyła już tej flagi. Aneks tworzy
   * się osobnym wywołaniem `/annex` po quote-update gdy delta != 0. Pole
   * zachowane dla wstecznej kompatybilności (stare instancje panela). */
  requiresAnnex?: boolean;
  /** @deprecated patrz wyżej. */
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

  const oldAmount =
    typeof service.amountEstimate === "number" ? service.amountEstimate : null;
  const newAmount = Number(body.newAmount.toFixed(2));
  const editorName =
    user.name?.trim() || user.preferred_username || user.email;

  try {
    // Wave 20 / Faza 1A — quote-update zawsze stosuje zmianę kwoty
    // bezpośrednio i loguje historię. NIE tworzy już aneksu — aneks
    // generuje się osobnym callem `/annex` z poziomu UI gdy serwisant
    // potwierdzi, że klient powinien dostać aneks (delta != 0).
    //
    // Backward-compat: stare instancje panela mogą nadal wysłać
    // `requiresAnnex=true` → wtedy zachowujemy stary 2-step (history
    // pending + annex) bez wywoływania update_amount. Frontend Wave 20
    // już tej flagi nie ustawia.
    if (body.requiresAnnex) {
      if (!body.acceptanceMethod) {
        return NextResponse.json(
          {
            error:
              "Gdy `requiresAnnex` = true, wymagane jest pole `acceptanceMethod` (documenso/phone/email)",
          },
          { status: 400, headers: PANEL_CORS_HEADERS },
        );
      }
      const annexDelta = Number((newAmount - (oldAmount ?? 0)).toFixed(2));
      const annex = await createServiceAnnex({
        serviceId: id,
        ticketNumber: service.ticketNumber,
        deltaAmount: annexDelta,
        reason: body.reason ?? "Aktualizacja wyceny",
        acceptanceMethod: body.acceptanceMethod,
        createdByEmail: user.email,
        createdByName: editorName,
      });
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
        summary: `Aneks utworzony (legacy path): Δ ${annexDelta} PLN`,
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
    }

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
    const delta = Number((newAmount - (oldAmount ?? 0)).toFixed(2));
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "quote_changed",
      actor: { email: user.email, name: editorName },
      summary: `Zmiana wyceny: ${oldAmount ?? 0} → ${newAmount} PLN`,
      payload: {
        oldAmount,
        newAmount,
        delta,
        reason: body.reason ?? null,
        quoteHistoryId: entry?.id ?? null,
      },
    });

    // Sygnał dla UI: gdy delta != 0, zachęcamy do wystawienia aneksu.
    // Nie blokujemy zmiany — UI pokazuje banner z opcjami "Wyślij aneks"
    // / "Pomiń". Polityka biznesowa: każda zmiana wyceny w trakcie naprawy
    // (czyli po podpisanym protokole) wymaga zgody klienta na piśmie.
    const requiresAnnexConfirmation = delta !== 0;
    return NextResponse.json(
      {
        ok: true,
        quoteHistory: entry,
        annex: null,
        requiresAnnexConfirmation,
        suggestedAnnex: requiresAnnexConfirmation
          ? {
              previousAmount: oldAmount ?? 0,
              newAmount,
              delta,
              reason: body.reason ?? "",
            }
          : null,
      },
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
