export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  type IntakeDraftPayload,
  upsertDraft,
} from "@/lib/intake-drafts";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/sse-bus";

const logger = log.child({ module: "api-panel-intake-drafts" });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

interface Body {
  conversationId?: unknown;
  locationId?: unknown;
  serviceId?: unknown;
  payload?: unknown;
}

/**
 * POST /api/panel/intake-drafts
 *
 * Sprzedawca publikuje stan formularza intake co ~2 s (debounced) gdy
 * w panelu wykryto aktywną Chatwoot conversation. Klucz po stronie DB
 * to `conversation_id` — Dashboard App polluje GET conversation-snapshot
 * z tym samym kluczem.
 *
 * Sanitization: payload przyjmuje tylko whitelistowane pola — żaden
 * `lockCode`/`patternLock`/`unlockPin`. Nawet gdyby klient wysłał
 * dodatkowe klucze, są dropowane przed insertem.
 *
 * Rate limit: 60 req/min per email — sprzedawca debounce 2 s daje 30/min,
 * 60 zostawia margin na multi-tab.
 */
export async function POST(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }

  // Real-time draft publish — sprzedawca strzela ~co 200ms (debounce w UI).
  // Capacity 600/min daje 10 req/s — wystarcza na real-time pisanie liter.
  const rl = rateLimit(`intake-draft:${user.email}`, {
    capacity: 600,
    refillPerSec: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele zapytań." },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const conversationId =
    typeof body.conversationId === "number" &&
    Number.isFinite(body.conversationId) &&
    body.conversationId > 0
      ? Math.floor(body.conversationId)
      : null;
  if (conversationId == null) {
    return NextResponse.json(
      { error: "conversationId (number) jest wymagane." },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const locationId =
    typeof body.locationId === "string" && body.locationId.trim()
      ? body.locationId.trim()
      : null;
  if (locationId && !user.locationIds.includes(locationId)) {
    return NextResponse.json(
      { error: "Brak dostępu do tej lokalizacji." },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  const serviceId =
    typeof body.serviceId === "string" && body.serviceId.trim()
      ? body.serviceId.trim()
      : null;

  const sanitized = sanitizePayload(body.payload);

  try {
    const draft = await upsertDraft({
      conversationId,
      payload: sanitized,
      locationId,
      salesEmail: user.email,
      serviceId,
    });
    // Wave 24 — real-time push do Dashboard App (Chatwoot iframe).
    // Bus filtruje subscriberów po payload.conversationId. Bez tego
    // iframe musiałby pollować — z tym widzi pisanie literek na żywo.
    publish({
      type: "intake_draft_changed",
      serviceId: draft.serviceId,
      payload: {
        conversationId: draft.conversationId,
        serviceId: draft.serviceId,
        updatedAt: draft.updatedAt,
      },
    });
    return NextResponse.json(
      {
        conversationId: draft.conversationId,
        updatedAt: draft.updatedAt,
      },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("upsertDraft failed", {
      conversationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się zapisać draftu." },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}

const ALLOWED_KEYS: ReadonlyArray<keyof IntakeDraftPayload> = [
  "brand",
  "model",
  "imei",
  "color",
  "lockType",
  "description",
  "amountEstimate",
  "customerFirstName",
  "customerLastName",
  "contactPhone",
  "contactEmail",
  "repairTypes",
  "visualCondition",
  "visualCompleted",
  "handoverChoice",
  "handoverItems",
  "priceLines",
  "readyToSubmit",
  "serviceId",
  "ticketNumber",
];

const VISUAL_CONDITION_MAX_BYTES = 10_000;
const PRICE_LINES_MAX_ITEMS = 32;

function sanitizePayload(input: unknown): IntakeDraftPayload {
  if (input == null || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const out: IntakeDraftPayload = {};
  for (const key of ALLOWED_KEYS) {
    const v = src[key];
    if (v === undefined) continue;
    if (key === "amountEstimate") {
      out.amountEstimate =
        typeof v === "number" && Number.isFinite(v) ? v : null;
    } else if (key === "readyToSubmit" || key === "visualCompleted") {
      (out as Record<string, unknown>)[key] = v == null ? null : Boolean(v);
    } else if (key === "handoverChoice") {
      out.handoverChoice =
        v === "none" || v === "items" ? v : null;
    } else if (key === "repairTypes") {
      out.repairTypes = Array.isArray(v)
        ? v.filter((s): s is string => typeof s === "string").slice(0, 32)
        : null;
    } else if (key === "visualCondition") {
      // Defensive size cap — visual condition jest object z kilkunastoma
      // ratingami + damages; 10KB starczy z zapasem na nadchodzące pola.
      if (v == null || typeof v !== "object") {
        out.visualCondition = null;
      } else {
        try {
          const json = JSON.stringify(v);
          if (json.length > VISUAL_CONDITION_MAX_BYTES) {
            out.visualCondition = null;
          } else {
            out.visualCondition = JSON.parse(json) as Record<string, unknown>;
          }
        } catch {
          out.visualCondition = null;
        }
      }
    } else if (key === "priceLines") {
      out.priceLines = Array.isArray(v)
        ? v
            .filter((x): x is Record<string, unknown> =>
              typeof x === "object" && x !== null,
            )
            .slice(0, PRICE_LINES_MAX_ITEMS)
        : null;
    } else {
      const s =
        typeof v === "string" ? v.slice(0, 2000) : v == null ? null : String(v);
      (out as Record<string, unknown>)[key] = s;
    }
  }
  return out;
}
