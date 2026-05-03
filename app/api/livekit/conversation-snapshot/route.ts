export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getDraft } from "@/lib/intake-drafts";
import {
  LiveKitNotConfiguredError,
  signChatwootInitiateToken,
} from "@/lib/livekit";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getService } from "@/lib/services";

const logger = log.child({ module: "livekit-conversation-snapshot" });

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

/**
 * GET /api/livekit/conversation-snapshot?conversation_id=<num>
 *
 * Wave 24 — public read-only endpoint dla Chatwoot Dashboard App. Klucz
 * to `conversation_id` (Chatwoot zna go zawsze — `{{conversation.id}}`),
 * w przeciwieństwie do `intake-snapshot` które wymaga `service_id`
 * (działa dopiero po zapisie ticketu).
 *
 * Flow:
 *   - Sprzedawca jeszcze nie zapisał intake'u → snapshot z `mp_intake_drafts`
 *     (draft.payload + sales_email + null serviceId). Dashboard App pokazuje
 *     "Wersja robocza" badge.
 *   - Sprzedawca zapisał ticket → drafts wiersz został `bindServiceToDraft`'em
 *     połączony z service_id, więc tu dociągamy aktualny stan z `getService`
 *     i mergujemy (service wins nad draftem dla pól które ma).
 *
 * Sanitization: tak samo jak intake-snapshot — bez lock_code/pattern.
 *
 * Token: jeśli LiveKit skonfigurowany, dorzucamy initiateToken zakotwiczony
 * na `conversationId` żeby agent mógł zainicjować rozmowę video bez
 * istniejącego service_id.
 */
export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`livekit-conv-snapshot:${ip}`, {
    capacity: 30,
    refillPerSec: 30 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele zapytań." },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("conversation_id")?.trim() ?? "";
  const conversationId = /^\d+$/.test(raw) ? Number(raw) : null;
  if (conversationId == null || conversationId <= 0) {
    return NextResponse.json(
      { error: "Parametr `conversation_id` (number) jest wymagany." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const draft = await getDraft(conversationId);

  // Jeśli draft ma już bound service_id, pobierz live snapshot z mp_services
  // — to staje się canonical źródło (sprzedawca może edytować dalej z poziomu
  // /serwis/<id>, draft nie jest już aktualizowany po submit).
  let liveService = null;
  if (draft?.serviceId) {
    try {
      liveService = await getService(draft.serviceId);
    } catch (err) {
      logger.warn("getService failed (continuing with draft)", {
        serviceId: draft.serviceId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!draft && !liveService) {
    // Pusta konwersacja (sprzedawca jeszcze nic nie napisał albo agent
    // skonfigurował Dashboard App z conv_id którego sprzedawca nie używa).
    // Nie wystawiamy initiateToken — atakujący zgadujący sequential
    // conversation_id nie może masowo mintować tokenów dla nieistniejących
    // rozmów. Token pojawia się dopiero gdy draft/service istnieje.
    return NextResponse.json(
      {
        conversationId,
        kind: "empty",
        snapshot: null,
        initiateToken: null,
      },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  const snapshot = mergeSnapshot(draft, liveService);

  let initiateToken: string | null = null;
  try {
    // Anchor: jeśli serwis już istnieje, używamy serviceId (matchuje
    // istniejący start-from-chatwoot-agent flow). Inaczej conversationId.
    initiateToken = await signChatwootInitiateToken(
      liveService?.id
        ? { serviceId: liveService.id, ttlSec: 5 * 60 }
        : { conversationId, ttlSec: 5 * 60 },
    );
  } catch (err) {
    if (!(err instanceof LiveKitNotConfiguredError)) {
      logger.warn("signChatwootInitiateToken failed (continuing)", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("conversation snapshot served", {
    conversationId,
    kind: liveService ? "service" : "draft",
    serviceId: liveService?.id ?? null,
    initiateToken: initiateToken ? "issued" : "skipped",
  });

  return NextResponse.json(
    {
      conversationId,
      kind: liveService ? "service" : "draft",
      snapshot,
      initiateToken,
    },
    { status: 200, headers: CORS_HEADERS },
  );
}

interface MergedSnapshot {
  serviceId: string | null;
  ticketNumber: string | null;
  status: string | null;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  lockType: string | null;
  description: string | null;
  diagnosis: string | null;
  amountEstimate: number | null;
  amountFinal: number | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  receivedBy: string | null;
  readyToSubmit: boolean;
  updatedAt: string | null;
  source: "draft" | "service" | "merged";
}

type LiveService = Awaited<ReturnType<typeof getService>>;

function mergeSnapshot(
  draft: Awaited<ReturnType<typeof getDraft>>,
  service: LiveService,
): MergedSnapshot {
  const p = draft?.payload ?? {};
  if (service) {
    return {
      serviceId: service.id,
      ticketNumber: service.ticketNumber,
      status: service.status,
      brand: service.brand ?? null,
      model: service.model ?? null,
      imei: service.imei ?? null,
      color: service.color ?? null,
      lockType: service.lockType ?? null,
      description: service.description ?? null,
      diagnosis: service.diagnosis ?? null,
      amountEstimate: service.amountEstimate ?? null,
      amountFinal: service.amountFinal ?? null,
      customerFirstName: service.customerFirstName ?? null,
      customerLastName: service.customerLastName ?? null,
      contactPhone: service.contactPhone ?? null,
      contactEmail: service.contactEmail ?? null,
      receivedBy: service.receivedBy ?? null,
      readyToSubmit: true,
      updatedAt: service.updatedAt ?? null,
      source: draft ? "merged" : "service",
    };
  }
  return {
    serviceId: null,
    ticketNumber: null,
    status: "draft",
    brand: p.brand ?? null,
    model: p.model ?? null,
    imei: p.imei ?? null,
    color: p.color ?? null,
    lockType: p.lockType ?? null,
    description: p.description ?? null,
    diagnosis: null,
    amountEstimate: p.amountEstimate ?? null,
    amountFinal: null,
    customerFirstName: p.customerFirstName ?? null,
    customerLastName: p.customerLastName ?? null,
    contactPhone: p.contactPhone ?? null,
    contactEmail: p.contactEmail ?? null,
    receivedBy: draft?.salesEmail ?? null,
    readyToSubmit: !!p.readyToSubmit,
    updatedAt: draft?.updatedAt ?? null,
    source: "draft",
  };
}

