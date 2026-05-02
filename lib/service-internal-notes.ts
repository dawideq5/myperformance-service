/**
 * Notatki wewnętrzne pracowników (Wave 19/Phase 1D).
 *
 * Komunikacja serwisant↔sprzedawca per zlecenie — NIE widoczne dla klienta.
 * visibility=team → wszyscy z dostępem; service_only → tylko serwis.
 * Soft delete (deleted_at). Tylko autor może usunąć/odpinąć własną notatkę.
 */

import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "service-internal-notes" });

export type InternalNoteVisibility = "team" | "service_only";
export type InternalNoteAuthorRole = "service" | "sales" | "driver" | "other";

export interface InternalNote {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  body: string;
  authorEmail: string | null;
  authorName: string | null;
  authorRole: InternalNoteAuthorRole;
  visibility: InternalNoteVisibility;
  pinned: boolean;
  createdAt: string;
  deletedAt: string | null;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  body: string;
  author_email: string | null;
  author_name: string | null;
  author_role: string | null;
  visibility: string | null;
  pinned: boolean | null;
  created_at: string;
  deleted_at: string | null;
}

function mapRow(r: Row): InternalNote {
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    body: r.body,
    authorEmail: r.author_email,
    authorName: r.author_name,
    authorRole: (r.author_role ?? "service") as InternalNoteAuthorRole,
    visibility: (r.visibility ?? "team") as InternalNoteVisibility,
    pinned: r.pinned === true,
    createdAt: r.created_at,
    deletedAt: r.deleted_at,
  };
}

export interface CreateInternalNoteInput {
  serviceId: string;
  ticketNumber?: string | null;
  body: string;
  authorEmail: string;
  authorName: string;
  authorRole?: InternalNoteAuthorRole;
  visibility?: InternalNoteVisibility;
  pinned?: boolean;
}

export async function createInternalNote(
  input: CreateInternalNoteInput,
): Promise<InternalNote | null> {
  if (!(await directusConfigured())) return null;
  const body = input.body.trim();
  if (!body) {
    throw new Error("Note body is required");
  }
  if (body.length > 5000) {
    throw new Error("Note body exceeds 5000 characters");
  }
  try {
    const created = await createItem<Row>("mp_service_internal_notes", {
      service_id: input.serviceId,
      ticket_number: input.ticketNumber ?? null,
      body,
      author_email: input.authorEmail,
      author_name: input.authorName,
      author_role: input.authorRole ?? "service",
      visibility: input.visibility ?? "team",
      pinned: input.pinned === true,
    });
    return mapRow(created);
  } catch (err) {
    logger.warn("createInternalNote failed", {
      serviceId: input.serviceId,
      err: String(err),
    });
    throw err;
  }
}

/**
 * Lista aktywnych notatek dla zlecenia. Sortowanie aplikowane po stronie
 * klienta (pinned first, potem chronologicznie). Filtr visibility w warstwie
 * endpointów (rola usera decyduje).
 */
export async function listInternalNotes(
  serviceId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<InternalNote[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    "filter[service_id][_eq]": serviceId,
    sort: "-created_at",
    limit: 200,
  };
  if (!options.includeDeleted) {
    query["filter[deleted_at][_null]"] = "true";
  }
  try {
    const rows = await listItems<Row>("mp_service_internal_notes", query);
    const notes = rows.map(mapRow);
    // Pinned first, potem najnowsze.
    notes.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
    return notes;
  } catch (err) {
    logger.warn("listInternalNotes failed", {
      serviceId,
      err: String(err),
    });
    return [];
  }
}

export async function getInternalNote(
  noteId: string,
): Promise<InternalNote | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<Row>("mp_service_internal_notes", {
      "filter[id][_eq]": noteId,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getInternalNote failed", { noteId, err: String(err) });
    return null;
  }
}

/** Soft delete — tylko autor może wywołać (sprawdzane po stronie endpointa). */
export async function softDeleteInternalNote(
  noteId: string,
): Promise<boolean> {
  if (!(await directusConfigured())) return false;
  try {
    await updateItem("mp_service_internal_notes", noteId, {
      deleted_at: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    logger.warn("softDeleteInternalNote failed", {
      noteId,
      err: String(err),
    });
    return false;
  }
}

export async function setInternalNotePinned(
  noteId: string,
  pinned: boolean,
): Promise<InternalNote | null> {
  if (!(await directusConfigured())) return null;
  try {
    const updated = await updateItem<Row>(
      "mp_service_internal_notes",
      noteId,
      { pinned },
    );
    return mapRow(updated);
  } catch (err) {
    logger.warn("setInternalNotePinned failed", {
      noteId,
      pinned,
      err: String(err),
    });
    return null;
  }
}
