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
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
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
  "warning",
  "error",
]);

export async function getActiveAnnouncements(): Promise<CmsAnnouncement[]> {
  if (!getConfig()) return [];
  try {
    const rows = await listItems<AnnouncementRow>("mp_announcements", {
      "filter[enabled][_eq]": "true",
      sort: "-starts_at",
      limit: 50,
    });
    const now = Date.now();
    return rows
      .filter((r) => {
        if (r.starts_at && Date.parse(r.starts_at) > now) return false;
        if (r.ends_at && Date.parse(r.ends_at) < now) return false;
        return true;
      })
      .map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        severity: SEVERITY_VALUES.has(r.severity as CmsAnnouncement["severity"])
          ? (r.severity as CmsAnnouncement["severity"])
          : "info",
        startsAt: r.starts_at,
        endsAt: r.ends_at,
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
