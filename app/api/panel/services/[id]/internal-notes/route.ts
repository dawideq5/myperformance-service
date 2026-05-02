/**
 * Notatki wewnętrzne — list + create (Wave 19/Phase 1D).
 *
 * GET — lista notatek dla zlecenia (filtr visibility w warstwie helpera nie
 *       jest stosowany; serwisanci/sprzedawcy widzą wszystko, a `service_only`
 *       jest tu jako placeholder do przyszłego role-gatingu).
 * POST — utwórz notatkę. Rate limit: 10 / 5min per (serviceId, user).
 *        publish() jest wywoływany przez logServiceAction → SSE bus oraz
 *        przez `internal_note_added` event poniżej (panel detail filtruje
 *        po type).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import {
  createInternalNote,
  listInternalNotes,
  type InternalNoteAuthorRole,
  type InternalNoteVisibility,
} from "@/lib/service-internal-notes";
import { publish } from "@/lib/sse-bus";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-internal-notes" });

const ALLOWED_VISIBILITY: InternalNoteVisibility[] = ["team", "service_only"];

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
  const notes = await listInternalNotes(id);
  return NextResponse.json({ notes }, { headers: PANEL_CORS_HEADERS });
}

interface PostBody {
  body?: string;
  visibility?: InternalNoteVisibility;
  pinned?: boolean;
  authorRole?: InternalNoteAuthorRole;
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
  // Rate limit: 10 notatek / 5min per user (capacity=10, refill 10/(5*60)).
  const rl = rateLimit(`svc-notes:${user.email}`, {
    capacity: 10,
    refillPerSec: 10 / (5 * 60),
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error:
          "Rate limit — maks 10 notatek na 5 minut. Spróbuj ponownie za chwilę.",
      },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  const text = body?.body?.trim() ?? "";
  if (!text) {
    return NextResponse.json(
      { error: "Pole `body` jest wymagane" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (text.length > 5000) {
    return NextResponse.json(
      { error: "Notatka przekracza 5000 znaków" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const visibility: InternalNoteVisibility =
    body?.visibility && ALLOWED_VISIBILITY.includes(body.visibility)
      ? body.visibility
      : "team";

  const authorName =
    user.name?.trim() || user.preferred_username || user.email;

  try {
    const note = await createInternalNote({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      body: text,
      authorEmail: user.email,
      authorName,
      authorRole: body?.authorRole ?? "service",
      visibility,
      pinned: body?.pinned === true,
    });

    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "note_added",
      actor: { email: user.email, name: authorName },
      summary: `Dodano notatkę wewnętrzną (${visibility})`,
      payload: {
        noteId: note?.id ?? null,
        visibility,
        pinned: body?.pinned === true,
        bodyPreview: text.slice(0, 120),
      },
    });

    // Real-time push — `internal_note_added` (oddzielny event od
    // `action_logged` żeby panel mógł filtrować precyzyjnie).
    publish({
      type: "internal_note_added",
      serviceId: id,
      payload: {
        noteId: note?.id ?? null,
        ticketNumber: service.ticketNumber,
        authorEmail: user.email,
        authorName,
        visibility,
        pinned: body?.pinned === true,
        bodyPreview: text.slice(0, 200),
      },
    });

    return NextResponse.json(
      { note },
      { status: 201, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("internal note create failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się utworzyć notatki", detail: String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}
