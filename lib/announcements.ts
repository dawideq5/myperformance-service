import {
  createItem,
  deleteItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "announcements" });

/**
 * MP Announcements — banery / komunikaty systemowe.
 * Kanoniczne źródło: Directus collection `mp_announcements`. Schema
 * tworzona idempotentnie przy starcie dashboardu (zob.
 * `lib/directus-cms/specs/system.ts`), więc admin może od razu dodawać
 * nowe wpisy z UI bez ręcznych migracji.
 */

export type AnnouncementSeverity = "info" | "success" | "warning" | "critical";

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  severity: AnnouncementSeverity;
  /** ISO timestamp; null = obowiązuje od razu. */
  activeFrom: string | null;
  /** ISO timestamp; null = bez końca. */
  activeUntil: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Opcjonalny scope — area-id (np. infrastructure) widoczny tylko dla
   * userów z uprawnieniem do tej area. Pusty = wszyscy zalogowani. */
  requiresArea: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string | null;
  severity: string | null;
  active_from: string | null;
  active_until: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  requires_area: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const SEVERITY_VALUES = new Set<AnnouncementSeverity>([
  "info",
  "success",
  "warning",
  "critical",
]);

function normalizeSeverity(s: string | null): AnnouncementSeverity {
  if (s && SEVERITY_VALUES.has(s as AnnouncementSeverity)) {
    return s as AnnouncementSeverity;
  }
  // Backward-compat: stary alias "error" → "critical".
  if (s === "error") return "critical";
  return "info";
}

function mapRow(r: AnnouncementRow): Announcement {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    severity: normalizeSeverity(r.severity),
    activeFrom: r.active_from ?? null,
    activeUntil: r.active_until ?? null,
    isActive: r.is_active !== false,
    sortOrder: r.sort_order ?? 0,
    requiresArea: r.requires_area || null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

export interface AnnouncementInput {
  title: string;
  body?: string | null;
  severity?: AnnouncementSeverity;
  activeFrom?: string | null;
  activeUntil?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  requiresArea?: string | null;
}

function inputToRow(
  input: Partial<AnnouncementInput>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body;
  if (input.severity !== undefined) patch.severity = input.severity;
  if (input.activeFrom !== undefined) patch.active_from = input.activeFrom;
  if (input.activeUntil !== undefined) patch.active_until = input.activeUntil;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.requiresArea !== undefined)
    patch.requires_area = input.requiresArea;
  return patch;
}

export function validateAnnouncement(
  input: Partial<AnnouncementInput>,
): string[] {
  const errors: string[] = [];
  if (!input.title?.trim()) errors.push("Tytuł wymagany");
  if (input.severity && !SEVERITY_VALUES.has(input.severity))
    errors.push("Nieprawidłowa waga komunikatu");
  if (input.activeFrom && input.activeUntil) {
    const from = Date.parse(input.activeFrom);
    const until = Date.parse(input.activeUntil);
    if (Number.isFinite(from) && Number.isFinite(until) && until < from) {
      errors.push("Aktywne do musi być >= aktywne od");
    }
  }
  return errors;
}

export async function listAnnouncements(): Promise<Announcement[]> {
  if (!(await directusConfigured())) return [];
  try {
    const rows = await listItems<AnnouncementRow>("mp_announcements", {
      sort: "sort_order,-active_from",
      limit: 500,
    });
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listAnnouncements failed", { err: String(err) });
    return [];
  }
}

/** Aktywne komunikaty: is_active=true ∧ active_from <= now ∧
 *  (active_until IS NULL OR active_until >= now). Sort: sort_order rosnąco,
 *  potem najnowsze active_from. */
export async function listActiveAnnouncements(): Promise<Announcement[]> {
  if (!(await directusConfigured())) return [];
  try {
    const rows = await listItems<AnnouncementRow>("mp_announcements", {
      "filter[is_active][_eq]": "true",
      sort: "sort_order,-active_from",
      limit: 100,
    });
    const now = Date.now();
    return rows
      .map(mapRow)
      .filter((a) => {
        if (a.activeFrom && Date.parse(a.activeFrom) > now) return false;
        if (a.activeUntil && Date.parse(a.activeUntil) < now) return false;
        return true;
      });
  } catch (err) {
    logger.warn("listActiveAnnouncements failed", { err: String(err) });
    return [];
  }
}

export async function createAnnouncement(
  input: AnnouncementInput,
): Promise<Announcement> {
  const errors = validateAnnouncement(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const created = await createItem<AnnouncementRow>(
    "mp_announcements",
    inputToRow(input),
  );
  return mapRow(created);
}

export async function updateAnnouncement(
  id: string,
  input: Partial<AnnouncementInput>,
): Promise<Announcement> {
  const errors = validateAnnouncement(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const updated = await updateItem<AnnouncementRow>(
    "mp_announcements",
    id,
    inputToRow(input),
  );
  return mapRow(updated);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteItem("mp_announcements", id);
}
