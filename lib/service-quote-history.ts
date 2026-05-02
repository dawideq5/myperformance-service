import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "service-quote-history" });

export interface QuoteHistoryItem {
  /** Nazwa pozycji wyceny. */
  name: string;
  qty?: number;
  price?: number;
}

export interface ServiceQuoteHistoryEntry {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  oldAmount: number | null;
  newAmount: number | null;
  delta: number | null;
  reason: string | null;
  items: QuoteHistoryItem[] | null;
  changedByEmail: string | null;
  changedByName: string | null;
  annexId: string | null;
  changedAt: string;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  old_amount: number | string | null;
  new_amount: number | string | null;
  delta: number | string | null;
  reason: string | null;
  items: unknown;
  changed_by_email: string | null;
  changed_by_name: string | null;
  annex_id: string | null;
  changed_at: string;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: Row): ServiceQuoteHistoryEntry {
  let items: QuoteHistoryItem[] | null = null;
  if (Array.isArray(r.items)) {
    items = r.items as QuoteHistoryItem[];
  } else if (typeof r.items === "string") {
    try {
      const parsed = JSON.parse(r.items);
      if (Array.isArray(parsed)) items = parsed as QuoteHistoryItem[];
    } catch {
      /* ignore */
    }
  }
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    oldAmount: num(r.old_amount),
    newAmount: num(r.new_amount),
    delta: num(r.delta),
    reason: r.reason,
    items,
    changedByEmail: r.changed_by_email,
    changedByName: r.changed_by_name,
    annexId: r.annex_id,
    changedAt: r.changed_at,
  };
}

export interface CreateQuoteHistoryInput {
  serviceId: string;
  ticketNumber?: string | null;
  oldAmount: number | null;
  newAmount: number | null;
  reason?: string | null;
  items?: QuoteHistoryItem[] | null;
  annexId?: string | null;
  changedByEmail?: string | null;
  changedByName?: string | null;
}

export async function createQuoteHistoryEntry(
  input: CreateQuoteHistoryInput,
): Promise<ServiceQuoteHistoryEntry | null> {
  if (!(await directusConfigured())) return null;
  const oldA = input.oldAmount ?? 0;
  const newA = input.newAmount ?? 0;
  const delta = Number((newA - oldA).toFixed(2));
  try {
    const created = await createItem<Row>("mp_service_quote_history", {
      service_id: input.serviceId,
      ticket_number: input.ticketNumber ?? null,
      old_amount: input.oldAmount,
      new_amount: input.newAmount,
      delta,
      reason: input.reason ?? null,
      items: input.items ?? null,
      annex_id: input.annexId ?? null,
      changed_by_email: input.changedByEmail ?? null,
      changed_by_name: input.changedByName ?? null,
    });
    return mapRow(created);
  } catch (err) {
    logger.warn("createQuoteHistoryEntry failed", {
      serviceId: input.serviceId,
      err: String(err),
    });
    throw err;
  }
}

export async function listQuoteHistory(
  serviceId: string,
  limit = 100,
): Promise<ServiceQuoteHistoryEntry[]> {
  if (!(await directusConfigured())) return [];
  try {
    const rows = await listItems<Row>("mp_service_quote_history", {
      "filter[service_id][_eq]": serviceId,
      sort: "-changed_at",
      limit,
    });
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listQuoteHistory failed", { serviceId, err: String(err) });
    return [];
  }
}
