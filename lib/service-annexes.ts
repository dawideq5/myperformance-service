import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";
import { publish } from "@/lib/sse-bus";

const logger = log.child({ module: "service-annexes" });

export type AnnexAcceptanceMethod = "documenso" | "phone" | "email";
export type AnnexAcceptanceStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired";

export interface ServiceAnnex {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  deltaAmount: number;
  reason: string;
  acceptanceMethod: AnnexAcceptanceMethod;
  acceptanceStatus: AnnexAcceptanceStatus;
  documensoDocId: number | null;
  documensoSigningUrl: string | null;
  customerName: string | null;
  messageId: string | null;
  conversationId: number | null;
  note: string | null;
  pdfHash: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
  createdAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  delta_amount: number | string;
  reason: string;
  acceptance_method: string;
  acceptance_status: string;
  documenso_doc_id: number | string | null;
  documenso_signing_url: string | null;
  customer_name: string | null;
  message_id: string | null;
  conversation_id: number | null;
  note: string | null;
  pdf_hash: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  created_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: Row): ServiceAnnex {
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    deltaAmount: num(r.delta_amount) ?? 0,
    reason: r.reason ?? "",
    acceptanceMethod: (r.acceptance_method ?? "phone") as AnnexAcceptanceMethod,
    acceptanceStatus: (r.acceptance_status ?? "pending") as AnnexAcceptanceStatus,
    documensoDocId: num(r.documenso_doc_id),
    documensoSigningUrl: r.documenso_signing_url,
    customerName: r.customer_name,
    messageId: r.message_id,
    conversationId: r.conversation_id,
    note: r.note,
    pdfHash: r.pdf_hash,
    createdByEmail: r.created_by_email,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    acceptedAt: r.accepted_at,
    rejectedAt: r.rejected_at,
  };
}

export interface CreateAnnexInput {
  serviceId: string;
  ticketNumber?: string | null;
  deltaAmount: number;
  reason: string;
  acceptanceMethod: AnnexAcceptanceMethod;
  documensoDocId?: number | null;
  documensoSigningUrl?: string | null;
  customerName?: string | null;
  messageId?: string | null;
  conversationId?: number | null;
  note?: string | null;
  pdfHash?: string | null;
  createdByEmail?: string | null;
  createdByName?: string | null;
}

export async function createServiceAnnex(
  input: CreateAnnexInput,
): Promise<ServiceAnnex | null> {
  if (!(await directusConfigured())) return null;
  try {
    const created = await createItem<Row>("mp_service_annexes", {
      service_id: input.serviceId,
      ticket_number: input.ticketNumber ?? null,
      delta_amount: input.deltaAmount,
      reason: input.reason,
      acceptance_method: input.acceptanceMethod,
      acceptance_status: "pending",
      documenso_doc_id: input.documensoDocId ?? null,
      documenso_signing_url: input.documensoSigningUrl ?? null,
      customer_name: input.customerName ?? null,
      message_id: input.messageId ?? null,
      conversation_id: input.conversationId ?? null,
      note: input.note ?? null,
      pdf_hash: input.pdfHash ?? null,
      created_by_email: input.createdByEmail ?? null,
      created_by_name: input.createdByName ?? null,
    });
    const mapped = mapRow(created);
    publish({
      type: "annex_created",
      serviceId: input.serviceId,
      payload: {
        annexId: mapped.id,
        ticketNumber: mapped.ticketNumber,
        deltaAmount: mapped.deltaAmount,
        acceptanceMethod: mapped.acceptanceMethod,
        acceptanceStatus: mapped.acceptanceStatus,
      },
    });
    return mapped;
  } catch (err) {
    logger.warn("createServiceAnnex failed", {
      serviceId: input.serviceId,
      err: String(err),
    });
    throw err;
  }
}

export async function listServiceAnnexes(
  serviceId: string,
  limit = 100,
): Promise<ServiceAnnex[]> {
  if (!(await directusConfigured())) return [];
  try {
    const rows = await listItems<Row>("mp_service_annexes", {
      "filter[service_id][_eq]": serviceId,
      sort: "-created_at",
      limit,
    });
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listServiceAnnexes failed", {
      serviceId,
      err: String(err),
    });
    return [];
  }
}

export async function getServiceAnnex(
  annexId: string,
): Promise<ServiceAnnex | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<Row>("mp_service_annexes", {
      "filter[id][_eq]": annexId,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getServiceAnnex failed", { annexId, err: String(err) });
    return null;
  }
}

export async function findAnnexByDocumensoId(
  docId: number,
): Promise<ServiceAnnex | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<Row>("mp_service_annexes", {
      "filter[documenso_doc_id][_eq]": docId,
      sort: "-created_at",
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("findAnnexByDocumensoId failed", { docId, err: String(err) });
    return null;
  }
}

/** Wave 21 / Faza 1E — błąd biznesowy gdy próba zmiany statusu narusza
 * skończony stan aneksu (accepted/rejected/expired). Caller (route)
 * powinien zwrócić HTTP 409 (Conflict) z komunikatem dla UI. */
export class AnnexStatusTransitionError extends Error {
  readonly currentStatus: AnnexAcceptanceStatus;
  readonly attemptedStatus: AnnexAcceptanceStatus;
  constructor(
    current: AnnexAcceptanceStatus,
    attempted: AnnexAcceptanceStatus,
  ) {
    super(
      `Aneks ma status finalny (${current}) — nie można zmienić na ${attempted}.`,
    );
    this.name = "AnnexStatusTransitionError";
    this.currentStatus = current;
    this.attemptedStatus = attempted;
  }
}

/** Wave 21 / Faza 1E — czy `from -> to` jest dopuszczalne. Polityka:
 *   pending → accepted | rejected | expired
 *   accepted | rejected | expired → tylko same do siebie (idempotent NO-OP);
 *     ale ponowne wpisanie tego samego statusu NIE jest błędem (np. webhook
 *     retry).
 */
export function isAnnexStatusTransitionAllowed(
  from: AnnexAcceptanceStatus,
  to: AnnexAcceptanceStatus,
): boolean {
  if (from === to) return true;
  if (from === "pending") {
    return to === "accepted" || to === "rejected" || to === "expired";
  }
  return false;
}

export async function updateServiceAnnex(
  annexId: string,
  patch: Partial<{
    acceptanceStatus: AnnexAcceptanceStatus;
    documensoDocId: number | null;
    documensoSigningUrl: string | null;
    customerName: string | null;
    messageId: string | null;
    conversationId: number | null;
    note: string | null;
    acceptedAt: string | null;
    rejectedAt: string | null;
  }>,
): Promise<ServiceAnnex | null> {
  if (!(await directusConfigured())) return null;
  // Wave 21 / Faza 1E — gdy przekazujemy nowy `acceptanceStatus`, walidujemy
  // przejście stanu. Pomijamy gdy patch jest czysto-meta (np. messageId).
  if (patch.acceptanceStatus !== undefined) {
    const current = await getServiceAnnex(annexId);
    if (
      current &&
      !isAnnexStatusTransitionAllowed(
        current.acceptanceStatus,
        patch.acceptanceStatus,
      )
    ) {
      throw new AnnexStatusTransitionError(
        current.acceptanceStatus,
        patch.acceptanceStatus,
      );
    }
  }
  const dbPatch: Record<string, unknown> = {};
  if (patch.acceptanceStatus !== undefined)
    dbPatch.acceptance_status = patch.acceptanceStatus;
  if (patch.documensoDocId !== undefined)
    dbPatch.documenso_doc_id = patch.documensoDocId;
  if (patch.documensoSigningUrl !== undefined)
    dbPatch.documenso_signing_url = patch.documensoSigningUrl;
  if (patch.customerName !== undefined) dbPatch.customer_name = patch.customerName;
  if (patch.messageId !== undefined) dbPatch.message_id = patch.messageId;
  if (patch.conversationId !== undefined)
    dbPatch.conversation_id = patch.conversationId;
  if (patch.note !== undefined) dbPatch.note = patch.note;
  if (patch.acceptedAt !== undefined) dbPatch.accepted_at = patch.acceptedAt;
  if (patch.rejectedAt !== undefined) dbPatch.rejected_at = patch.rejectedAt;
  try {
    const updated = await updateItem<Row>("mp_service_annexes", annexId, dbPatch);
    const mapped = mapRow(updated);
    // Real-time push gdy zmiana acceptanceStatus = accepted/rejected. Pomijamy
    // updaty czysto-meta (np. messageId) żeby nie spamować.
    if (patch.acceptanceStatus === "accepted") {
      publish({
        type: "annex_accepted",
        serviceId: mapped.serviceId,
        payload: {
          annexId: mapped.id,
          ticketNumber: mapped.ticketNumber,
          deltaAmount: mapped.deltaAmount,
          acceptedAt: mapped.acceptedAt,
        },
      });
    } else if (patch.acceptanceStatus === "rejected") {
      publish({
        type: "annex_rejected",
        serviceId: mapped.serviceId,
        payload: {
          annexId: mapped.id,
          ticketNumber: mapped.ticketNumber,
          deltaAmount: mapped.deltaAmount,
          rejectedAt: mapped.rejectedAt,
        },
      });
    }
    return mapped;
  } catch (err) {
    if (err instanceof AnnexStatusTransitionError) throw err;
    logger.warn("updateServiceAnnex failed", { annexId, err: String(err) });
    return null;
  }
}

/**
 * Wave 21 / Faza 1E — unieważnia wszystkie pending aneksy do danego
 * service'u. Używane gdy serwisant zmienia wycenę poza aneksem (każda
 * dotychczas otwarta propozycja staje się nieaktualna) lub zmienia email
 * klienta (Documenso link na stary email staje się sierotą).
 *
 * Zwraca liczbę zaktualizowanych aneksów. Best-effort — błąd update
 * pojedynczego aneksu nie blokuje pozostałych.
 */
export async function expirePendingAnnexes(
  serviceId: string,
  reason: string,
): Promise<{ expiredAnnexIds: string[] }> {
  if (!(await directusConfigured())) return { expiredAnnexIds: [] };
  const annexes = await listServiceAnnexes(serviceId);
  const pending = annexes.filter((a) => a.acceptanceStatus === "pending");
  const expiredAnnexIds: string[] = [];
  for (const a of pending) {
    try {
      const note = a.note ? `${a.note}\n[expired] ${reason}` : `[expired] ${reason}`;
      const updated = await updateServiceAnnex(a.id, {
        acceptanceStatus: "expired",
        note,
      });
      if (updated) expiredAnnexIds.push(a.id);
    } catch (err) {
      logger.warn("expirePendingAnnexes single update failed", {
        serviceId,
        annexId: a.id,
        err: String(err),
      });
    }
  }
  return { expiredAnnexIds };
}
