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

  const rl = rateLimit(`intake-draft:${user.email}`, {
    capacity: 60,
    refillPerSec: 60 / 60,
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
  "readyToSubmit",
  "serviceId",
  "ticketNumber",
];

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
    } else if (key === "readyToSubmit") {
      out.readyToSubmit = Boolean(v);
    } else if (key === "repairTypes") {
      out.repairTypes = Array.isArray(v)
        ? v.filter((s): s is string => typeof s === "string").slice(0, 32)
        : null;
    } else {
      const s =
        typeof v === "string" ? v.slice(0, 2000) : v == null ? null : String(v);
      (out as Record<string, unknown>)[key] = s;
    }
  }
  return out;
}
