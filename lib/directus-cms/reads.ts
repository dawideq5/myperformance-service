import { getConfig, logger } from "./client";
import { listItems } from "./items";
import type { CmsAnnouncement, CmsLink } from "./types";

/**
 * Public read API — używane przez dashboard do pull-owania user-facing CMS
 * content (banery, linki w stopce). Zwracają [] gdy Directus niedostępny —
 * dashboard musi tolerować brak treści (zero-state).
 */

interface AnnouncementRow {
  id: string;
  title: string;
  body: string | null;
  severity: string | null;
  is_active: boolean | null;
  active_from: string | null;
  active_until: string | null;
  sort_order: number | null;
  requires_area: string | null;
}

interface LinkRow {
  id: string;
  category: string | null;
  label: string;
  url: string;
  icon: string | null;
  sort: number | null;
  enabled: boolean;
  requires_area: string | null;
}

const SEVERITY_VALUES: ReadonlySet<CmsAnnouncement["severity"]> = new Set([
  "info",
  "success",
  "warning",
  "critical",
]);

function normalizeSeverity(s: string | null): CmsAnnouncement["severity"] {
  if (s && SEVERITY_VALUES.has(s as CmsAnnouncement["severity"])) {
    return s as CmsAnnouncement["severity"];
  }
  // Backward-compat: legacy "error" → "critical".
  if (s === "error") return "critical";
  return "info";
}

export async function getActiveAnnouncements(): Promise<CmsAnnouncement[]> {
  if (!getConfig()) return [];
  try {
    const rows = await listItems<AnnouncementRow>("mp_announcements", {
      "filter[is_active][_eq]": "true",
      sort: "sort_order,-active_from",
      limit: 100,
    });
    const now = Date.now();
    return rows
      .filter((r) => {
        if (r.active_from && Date.parse(r.active_from) > now) return false;
        if (r.active_until && Date.parse(r.active_until) < now) return false;
        return true;
      })
      .map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        severity: normalizeSeverity(r.severity),
        activeFrom: r.active_from,
        activeUntil: r.active_until,
        isActive: r.is_active !== false,
        sortOrder: r.sort_order ?? 0,
        requiresArea: r.requires_area || null,
      }));
  } catch (err) {
    logger.warn("getActiveAnnouncements failed", { err: String(err) });
    return [];
  }
}

export async function getLinks(
  category?: CmsLink["category"],
): Promise<CmsLink[]> {
  if (!getConfig()) return [];
  try {
    const query: Record<string, string | number> = {
      "filter[enabled][_eq]": "true",
      sort: "sort,label",
      limit: 200,
    };
    if (category) query["filter[category][_eq]"] = category;
    const rows = await listItems<LinkRow>("mp_links", query);
    return rows
      .filter((r) => r.label && r.url && r.category)
      .map((r) => ({
        id: r.id,
        category: r.category as CmsLink["category"],
        label: r.label,
        url: r.url,
        icon: r.icon,
        sort: r.sort ?? 0,
        requiresArea: r.requires_area || null,
      }));
  } catch (err) {
    logger.warn("getLinks failed", { err: String(err) });
    return [];
  }
}
