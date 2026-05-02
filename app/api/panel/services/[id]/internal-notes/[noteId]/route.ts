/**
 * Notatki wewnętrzne — delete (soft) + pin/unpin (Wave 19/Phase 1D).
 *
 * Uprawnienia: tylko autor notatki może wywołać DELETE/PATCH. Sprawdzamy
 * po `authorEmail`. Soft delete (deleted_at). Real-time push przez SSE bus.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import {
  getInternalNote,
  setInternalNotePinned,
  softDeleteInternalNote,
} from "@/lib/service-internal-notes";
import { publish } from "@/lib/sse-bus";

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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, noteId } = await params;
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
  const note = await getInternalNote(noteId);
  if (!note || note.serviceId !== id) {
    return NextResponse.json(
      { error: "Note not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (note.deletedAt) {
    return NextResponse.json(
      { ok: true, alreadyDeleted: true },
      { headers: PANEL_CORS_HEADERS },
    );
  }
  if (
    !note.authorEmail ||
    note.authorEmail.toLowerCase() !== user.email.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Możesz usunąć tylko własne notatki" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  const ok = await softDeleteInternalNote(noteId);
  if (!ok) {
    return NextResponse.json(
      { error: "Nie udało się usunąć notatki" },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "note_deleted",
    actor: {
      email: user.email,
      name: user.name?.trim() || user.preferred_username || user.email,
    },
    summary: "Usunięto notatkę wewnętrzną",
    payload: { noteId },
  });

  publish({
    type: "internal_note_deleted",
    serviceId: id,
    payload: { noteId, ticketNumber: service.ticketNumber },
  });

  return NextResponse.json({ ok: true }, { headers: PANEL_CORS_HEADERS });
}

interface PatchBody {
  pinned?: boolean;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, noteId } = await params;
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
  const note = await getInternalNote(noteId);
  if (!note || note.serviceId !== id) {
    return NextResponse.json(
      { error: "Note not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (note.deletedAt) {
    return NextResponse.json(
      { error: "Notatka usunięta" },
      { status: 410, headers: PANEL_CORS_HEADERS },
    );
  }
  // Pin/unpin: tylko autor (analogicznie do delete).
  if (
    !note.authorEmail ||
    note.authorEmail.toLowerCase() !== user.email.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Możesz przypiąć/odpiąć tylko własne notatki" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body || typeof body.pinned !== "boolean") {
    return NextResponse.json(
      { error: "Pole `pinned` (boolean) jest wymagane" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const updated = await setInternalNotePinned(noteId, body.pinned);
  if (!updated) {
    return NextResponse.json(
      { error: "Nie udało się zaktualizować" },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
  publish({
    type: body.pinned ? "internal_note_pinned" : "internal_note_unpinned",
    serviceId: id,
    payload: {
      noteId,
      pinned: body.pinned,
      ticketNumber: service.ticketNumber,
    },
  });
  return NextResponse.json(
    { note: updated },
    { headers: PANEL_CORS_HEADERS },
  );
}
