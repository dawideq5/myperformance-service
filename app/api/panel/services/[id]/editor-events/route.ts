/**
 * Editor presence + field-change publish endpoint (Wave 22 / F15).
 *
 * Klient (panel sprzedawcy w trakcie intake'u, kierownik w edycji zlecenia)
 * woła ten endpoint żeby:
 *   - heartbeat — co 10s w trakcie edycji formularza
 *   - field_changed — debounced (500ms) per zmiana pola
 *   - disconnected — explicit teardown przy unmount
 *
 * Identity (`byUserId`, `byUserEmail`, `byUserName`, `byUserRole`) jest
 * **zawsze** derived server-side z PanelUser — klient nie może spoofować
 * cudzego usera (defense-in-depth).
 *
 * `byUserRole` derived z realm roles:
 *   - ma `serwisant` → "service"
 *   - ma `sprzedawca` → "sales"
 *   - inne (admin, kierownik) → "service" jako fallback (zwykle są również
 *     w panelu serwisanta).
 *
 * Rate limit: 30 calls / 5s per (user, service). Heartbeat = 1/10s, field-
 * changed bursts wokół 2/s przy szybkim wpisywaniu — kapacita 30 wystarcza.
 *
 * Read-only enforcement: ten endpoint nie modyfikuje żadnych encji.
 * Wszystko poza publish() do SSE bus + presence cache w pamięci.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/sse-bus";
import {
  recordHeartbeat,
  recordDisconnect,
  type EditorRole,
} from "@/lib/editor-presence";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-editor-events" });

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

function deriveRole(realmRoles: readonly string[]): EditorRole {
  if (realmRoles.includes("serwisant")) return "service";
  if (realmRoles.includes("sprzedawca")) return "sales";
  // admin / kierownik / inne — zakładamy serwisanta (zwykle mają oba dostępy
  // ale w kontekście intake formularza widać ich jako "service-side viewer").
  return "service";
}

interface BodyShape {
  kind?: string;
  field?: string;
  value?: unknown;
}

const ALLOWED_FIELDS = new Set([
  "brand",
  "model",
  "imei",
  "color",
  "lockType",
  "lockCode",
  "visualCondition",
  "repairTypes",
  "customDescription",
  "amountEstimate",
  "customerFirstName",
  "customerLastName",
  "contactPhone",
  "contactEmail",
  "handoverChoice",
  "handoverItems",
  "chosenServiceLocationId",
  "releaseCodeChannel",
]);

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

  if (!user.sub) {
    return NextResponse.json(
      { error: "Token bez sub" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

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

  const rl = rateLimit(`editor-events:${user.sub}:${id}`, {
    capacity: 30,
    refillPerSec: 6,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: PANEL_CORS_HEADERS },
    );
  }

  let body: BodyShape;
  try {
    body = (await req.json()) as BodyShape;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const role = deriveRole(user.realmRoles);
  const byUserId = user.sub;
  const byUserEmail = user.email;
  const byUserName = user.name?.trim() || user.preferred_username || user.email;

  if (body.kind === "heartbeat") {
    const { isNew } = recordHeartbeat({
      serviceId: id,
      byUserId,
      byUserEmail,
      byUserName,
      byUserRole: role,
    });
    publish({
      type: "service.editor_heartbeat",
      serviceId: id,
      payload: {
        byUserId,
        byUserEmail,
        byUserName,
        byUserRole: role,
        isNew,
      },
    });
    return NextResponse.json({ ok: true, isNew }, { headers: PANEL_CORS_HEADERS });
  }

  if (body.kind === "field_changed") {
    if (typeof body.field !== "string" || !ALLOWED_FIELDS.has(body.field)) {
      return NextResponse.json(
        { error: "Unknown field" },
        { status: 400, headers: PANEL_CORS_HEADERS },
      );
    }
    // Heartbeat-on-edit: każda zmiana pola odświeża presence (user
    // jest nadal aktywny). Jeśli nie miał heartbeatu, dodajemy.
    recordHeartbeat({
      serviceId: id,
      byUserId,
      byUserEmail,
      byUserName,
      byUserRole: role,
    });
    publish({
      type: "service.field_changed",
      serviceId: id,
      payload: {
        field: body.field,
        value: body.value,
        byUserId,
        byUserEmail,
        byUserName,
        byUserRole: role,
      },
    });
    return NextResponse.json({ ok: true }, { headers: PANEL_CORS_HEADERS });
  }

  if (body.kind === "disconnected") {
    const removed = recordDisconnect(id, byUserId);
    if (removed) {
      publish({
        type: "service.editor_disconnected",
        serviceId: id,
        payload: {
          byUserId,
          byUserEmail,
          byUserName,
          byUserRole: role,
          reason: "explicit",
        },
      });
    }
    return NextResponse.json(
      { ok: true, hadPresence: !!removed },
      { headers: PANEL_CORS_HEADERS },
    );
  }

  logger.debug("unknown editor-event kind", { kind: body.kind });
  return NextResponse.json(
    { error: "Unknown kind" },
    { status: 400, headers: PANEL_CORS_HEADERS },
  );
}
