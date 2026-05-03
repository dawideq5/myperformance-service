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
  type InternalNoteViewerRole,
  type InternalNoteVisibility,
} from "@/lib/service-internal-notes";
import { publish } from "@/lib/sse-bus";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-internal-notes" });

// Wave 21 / Faza 1D — `sales_only` dodane gdy zostały zunifikowane czat
// zespołu + notatki. UI mapuje "Wszyscy / Tylko serwisanci / Tylko sprzedawcy"
// → "team / service_only / sales_only".
const ALLOWED_VISIBILITY: InternalNoteVisibility[] = [
  "team",
  "service_only",
  "sales_only",
];

/**
 * Wave 22 / F9 — RBAC dla zapisu visibility:
 *   - service → może wybrać `team` lub `service_only` (NIGDY `sales_only`)
 *   - sales   → może wybrać `team` lub `sales_only` (NIGDY `service_only`)
 *   - admin   → bez ograniczeń (zachowanie back-office'u)
 *
 * Cel: serwisant nie powinien móc zapisać notatki "tylko sprzedawcy"
 * (i odwrotnie) — to bezsensowne z UX i wycieka informacje do drugiego działu.
 * Filter dzieje się też w UI (warstwa kosmetyczna), ale serwer jest source
 * of truth.
 */
function visibilityAllowedForRole(
  visibility: InternalNoteVisibility,
  viewerRole: InternalNoteViewerRole,
): boolean {
  if (viewerRole === "admin") return true;
  if (visibility === "team") return true;
  if (viewerRole === "service") return visibility === "service_only";
  if (viewerRole === "sales") return visibility === "sales_only";
  return false;
}

/**
 * Heurystyka roli widza na podstawie realm roles z KC. Priorytet:
 *   1. `service_admin` / `admin` → admin (widzi wszystko)
 *   2. `serwisant` → service
 *   3. `sprzedawca` → sales
 *   4. fallback service (najczęstszy konsument panelu)
 *
 * Wave 21 — sprzedawca również może mieć rolę `serwisant` (uniwersalny user);
 * w tym wypadku gra rolę serwisanta. Eksplicytny query param `?role=sales`
 * pozwala panelowi sprzedawcy wymusić swoją perspektywę gdy konto ma obie
 * role. Bez query param → fallback do automatycznej heurystyki.
 */
function resolveViewerRole(
  realmRoles: readonly string[],
  override: string | null,
): InternalNoteViewerRole {
  if (override === "sales" || override === "service" || override === "admin") {
    return override;
  }
  const set = new Set(realmRoles);
  if (set.has("admin") || set.has("service_admin")) return "admin";
  if (set.has("serwisant")) return "service";
  if (set.has("sprzedawca")) return "sales";
  return "service";
}

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
  const url = new URL(req.url);
  const viewerRole = resolveViewerRole(
    user.realmRoles,
    url.searchParams.get("role"),
  );
  const notes = await listInternalNotes(id, { viewerRole });
  return NextResponse.json(
    { notes, viewerRole },
    { headers: PANEL_CORS_HEADERS },
  );
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
  const requestedVisibility: InternalNoteVisibility =
    body?.visibility && ALLOWED_VISIBILITY.includes(body.visibility)
      ? body.visibility
      : "team";

  // Wave 22 / F9 — `authorName` z KC profile (firstName + lastName) zamiast
  // surowego `user.name` które dla kont bez wypełnionego profilu zwraca
  // username (np. "Dawidtychy5"). Fallback: email local-part.
  const fullName = [user.firstName, user.lastName]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .join(" ")
    .trim();
  const authorName =
    fullName ||
    user.name?.trim() ||
    user.preferred_username ||
    user.email;

  // Wave 21 — domyślny `authorRole` z heurystyki KC roles. Klient może
  // nadpisać (panel sprzedawcy → "sales").
  const url = new URL(req.url);
  const viewerRole = resolveViewerRole(
    user.realmRoles,
    url.searchParams.get("role"),
  );

  // Wave 22 / F9 — odrzucamy visibility nieadekwatne do roli (serwisant nie
  // może zapisać `sales_only` itd.). UI też filtruje — to defense in depth.
  if (!visibilityAllowedForRole(requestedVisibility, viewerRole)) {
    return NextResponse.json(
      {
        error:
          "Wybrana widoczność jest niedostępna dla Twojej roli. Wybierz „Wszyscy” lub widoczność dla swojego działu.",
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const visibility = requestedVisibility;

  const inferredAuthorRole: InternalNoteAuthorRole =
    body?.authorRole ??
    (viewerRole === "sales" ? "sales" : "service");

  try {
    const note = await createInternalNote({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      body: text,
      authorEmail: user.email,
      authorName,
      authorRole: inferredAuthorRole,
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
