import { listServices } from "@/lib/services";
import type { ServiceTicket } from "@/lib/services";
import { log } from "@/lib/logger";

const logger = log.child({ module: "chatwoot-service-binding" });

/**
 * Map an inbound Chatwoot message → an open service ticket.
 *
 * Match priority:
 *   1) Eksplicytny `#SVC-YYYY-MM-NNNN` w treści wiadomości — wygrywa
 *      bezspornie nawet gdy klient pisze z innego adresu.
 *   2) `additional_attributes.ticket_number` na conversation (web widget
 *      pre-chat form forwarduje to jako custom attribute).
 *   3) Email klienta — szukamy najnowszego otwartego serwisu z tym
 *      contact_email.
 *   4) Telefon — fallback (SMS inbox bez emaila).
 *
 * Zlecenia w stanach finalnych (closed, cancelled, archived,
 * delivered, returned_no_repair, rejected_by_customer) są pomijane.
 */

const TICKET_REGEX = /#?(SVC-\d{4}-\d{2}-\d{4})/i;

const FINAL_STATUSES = new Set([
  "closed",
  "cancelled",
  "archived",
  "delivered",
  "returned_no_repair",
  "rejected_by_customer",
]);

export interface BindContext {
  messageBody?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  ticketNumberHint?: string | null;
}

export interface BindResult {
  service: ServiceTicket;
  /** Jak udało się dopasować — przydatne w logu/audicie. */
  matchedBy: "ticket_in_body" | "ticket_attribute" | "email" | "phone";
  ticketNumber: string;
}

function isOpen(s: ServiceTicket): boolean {
  return !FINAL_STATUSES.has(s.status);
}

function pickNewestOpen(rows: ServiceTicket[]): ServiceTicket | null {
  const open = rows.filter(isOpen);
  if (open.length === 0) return null;
  open.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
  return open[0] ?? null;
}

export function extractTicketNumber(body: string | null | undefined): string | null {
  if (!body) return null;
  const m = TICKET_REGEX.exec(body);
  return m ? m[1].toUpperCase() : null;
}

async function findByTicketNumber(ticket: string): Promise<ServiceTicket | null> {
  try {
    const rows = await listServices({ search: ticket, limit: 5 });
    const exact = rows.find((s) => s.ticketNumber.toUpperCase() === ticket);
    return exact ?? null;
  } catch (err) {
    logger.warn("findByTicketNumber failed", { ticket, err: String(err) });
    return null;
  }
}

async function findOpenByEmail(email: string): Promise<ServiceTicket | null> {
  try {
    const rows = await listServices({ search: email, limit: 25 });
    const filtered = rows.filter(
      (r) => (r.contactEmail ?? "").toLowerCase() === email.toLowerCase(),
    );
    return pickNewestOpen(filtered);
  } catch (err) {
    logger.warn("findOpenByEmail failed", { err: String(err) });
    return null;
  }
}

async function findOpenByPhone(phone: string): Promise<ServiceTicket | null> {
  // Normalizujemy do digitów — Chatwoot dostarcza często "+48 600 000 000",
  // nasz `contact_phone` mógł być wpisany inaczej.
  const norm = phone.replace(/\D+/g, "").slice(-9); // 9 ostatnich cyfr (PL)
  if (norm.length < 6) return null;
  try {
    const rows = await listServices({ search: norm, limit: 25 });
    const filtered = rows.filter((r) => {
      const p = (r.contactPhone ?? "").replace(/\D+/g, "");
      return p.endsWith(norm);
    });
    return pickNewestOpen(filtered);
  } catch (err) {
    logger.warn("findOpenByPhone failed", { err: String(err) });
    return null;
  }
}

export async function bindInboundToService(
  ctx: BindContext,
): Promise<BindResult | null> {
  // 1) Ticket w treści wiadomości
  const ticketInBody = extractTicketNumber(ctx.messageBody);
  if (ticketInBody) {
    const s = await findByTicketNumber(ticketInBody);
    if (s) {
      return { service: s, matchedBy: "ticket_in_body", ticketNumber: s.ticketNumber };
    }
  }
  // 2) Ticket z pre-chat custom attribute
  const ticketAttr =
    typeof ctx.ticketNumberHint === "string"
      ? extractTicketNumber(ctx.ticketNumberHint) ?? ctx.ticketNumberHint.toUpperCase()
      : null;
  if (ticketAttr && /^SVC-\d{4}-\d{2}-\d{4}$/.test(ticketAttr)) {
    const s = await findByTicketNumber(ticketAttr);
    if (s) {
      return {
        service: s,
        matchedBy: "ticket_attribute",
        ticketNumber: s.ticketNumber,
      };
    }
  }
  // 3) Email
  if (ctx.customerEmail) {
    const s = await findOpenByEmail(ctx.customerEmail.trim());
    if (s) {
      return { service: s, matchedBy: "email", ticketNumber: s.ticketNumber };
    }
  }
  // 4) Telefon
  if (ctx.customerPhone) {
    const s = await findOpenByPhone(ctx.customerPhone.trim());
    if (s) {
      return { service: s, matchedBy: "phone", ticketNumber: s.ticketNumber };
    }
  }
  return null;
}
