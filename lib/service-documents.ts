/**
 * Wave 21 / Faza 1B — biblioteka dokumentów per zlecenie serwisowe.
 *
 * Tabela `mp_service_documents` (Directus) trzyma metadane wszystkich
 * dokumentów PDF wystawionych w cyklu życia zlecenia (potwierdzenie
 * przyjęcia, aneks, protokół wydania, kod wydania, gwarancja, ...).
 *
 * Wzór z `lib/service-photos.ts` (CRUD + soft delete + sse publish).
 * Soft-delete (deleted_at) — fizycznych delete nie robimy bo file_id
 * pozostaje w Directus Files dla audit trail.
 */
import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";
import { publish } from "@/lib/sse-bus";
import type { SignatureAnchor } from "@/lib/services/signature-anchors";

const logger = log.child({ module: "service-documents" });

export type ServiceDocumentKind =
  | "receipt"
  | "annex"
  | "handover"
  | "release_code"
  | "warranty"
  | "other";

export type ServiceDocumentStatus =
  | "draft"
  | "sent"
  | "partially_signed"
  | "signed"
  | "rejected"
  | "expired";

/** Wave 21 / Faza 1E — błąd biznesowy gdy próba zmiany statusu narusza
 * skończony stan dokumentu (signed). */
export class ServiceDocumentStatusTransitionError extends Error {
  readonly currentStatus: ServiceDocumentStatus;
  readonly attemptedStatus: ServiceDocumentStatus;
  constructor(
    current: ServiceDocumentStatus,
    attempted: ServiceDocumentStatus,
  ) {
    super(
      `Dokument ma status finalny (${current}) — nie można zmienić na ${attempted}.`,
    );
    this.name = "ServiceDocumentStatusTransitionError";
    this.currentStatus = current;
    this.attemptedStatus = attempted;
  }
}

/** Wave 21 / Faza 1E — dopuszczalne przejścia statusów dokumentów:
 *   draft → sent | expired
 *   sent → partially_signed | signed | rejected | expired
 *   partially_signed → signed | rejected | expired
 *   signed → final (idempotent same-state OK)
 *   rejected → final (idempotent same-state OK; UI pozwoli duplikować jako nowy draft osobno)
 *   expired → final (idempotent same-state OK)
 */
export function isServiceDocumentStatusTransitionAllowed(
  from: ServiceDocumentStatus,
  to: ServiceDocumentStatus,
): boolean {
  if (from === to) return true;
  if (from === "draft") return to === "sent" || to === "expired";
  if (from === "sent") {
    return (
      to === "partially_signed" ||
      to === "signed" ||
      to === "rejected" ||
      to === "expired"
    );
  }
  if (from === "partially_signed") {
    return to === "signed" || to === "rejected" || to === "expired";
  }
  // signed / rejected / expired = stany końcowe.
  return false;
}

export type ServiceDocumentRelatedKind =
  | "annex"
  | "release_code"
  | "receipt"
  | "handover"
  | "warranty"
  | "other";

export interface ServiceDocument {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  kind: ServiceDocumentKind;
  title: string | null;
  originalPdfFileId: string | null;
  signedPdfFileId: string | null;
  documensoDocId: number | null;
  documensoSigningUrl: string | null;
  status: ServiceDocumentStatus;
  signatureAnchors: SignatureAnchor[] | null;
  relatedId: string | null;
  relatedKind: ServiceDocumentRelatedKind | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  kind: string;
  title: string | null;
  original_pdf_file_id: string | null;
  signed_pdf_file_id: string | null;
  documenso_doc_id: number | string | null;
  documenso_signing_url: string | null;
  status: string;
  signature_anchors: SignatureAnchor[] | string | null;
  related_id: string | null;
  related_kind: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseAnchors(
  v: SignatureAnchor[] | string | null | undefined,
): SignatureAnchor[] | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as SignatureAnchor[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function mapRow(r: Row): ServiceDocument {
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    kind: (r.kind ?? "other") as ServiceDocumentKind,
    title: r.title,
    originalPdfFileId: r.original_pdf_file_id,
    signedPdfFileId: r.signed_pdf_file_id,
    documensoDocId: num(r.documenso_doc_id),
    documensoSigningUrl: r.documenso_signing_url,
    status: (r.status ?? "draft") as ServiceDocumentStatus,
    signatureAnchors: parseAnchors(r.signature_anchors),
    relatedId: r.related_id,
    relatedKind: (r.related_kind ?? null) as ServiceDocumentRelatedKind | null,
    createdByEmail: r.created_by_email,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export interface CreateServiceDocumentInput {
  serviceId: string;
  ticketNumber?: string | null;
  kind: ServiceDocumentKind;
  title?: string | null;
  originalPdfFileId?: string | null;
  signedPdfFileId?: string | null;
  documensoDocId?: number | null;
  documensoSigningUrl?: string | null;
  status?: ServiceDocumentStatus;
  signatureAnchors?: SignatureAnchor[] | null;
  relatedId?: string | null;
  relatedKind?: ServiceDocumentRelatedKind | null;
  createdByEmail?: string | null;
}

export async function createServiceDocument(
  input: CreateServiceDocumentInput,
): Promise<ServiceDocument | null> {
  if (!(await directusConfigured())) return null;
  try {
    const created = await createItem<Row>("mp_service_documents", {
      service_id: input.serviceId,
      ticket_number: input.ticketNumber ?? null,
      kind: input.kind,
      title: input.title ?? null,
      original_pdf_file_id: input.originalPdfFileId ?? null,
      signed_pdf_file_id: input.signedPdfFileId ?? null,
      documenso_doc_id: input.documensoDocId ?? null,
      documenso_signing_url: input.documensoSigningUrl ?? null,
      status: input.status ?? "draft",
      signature_anchors: input.signatureAnchors ?? null,
      related_id: input.relatedId ?? null,
      related_kind: input.relatedKind ?? null,
      created_by_email: input.createdByEmail ?? null,
    });
    const mapped = mapRow(created);
    publish({
      type: "document_created",
      serviceId: mapped.serviceId,
      payload: {
        documentId: mapped.id,
        kind: mapped.kind,
        status: mapped.status,
        title: mapped.title,
      },
    });
    return mapped;
  } catch (err) {
    logger.warn("createServiceDocument failed", {
      serviceId: input.serviceId,
      kind: input.kind,
      err: String(err),
    });
    throw err;
  }
}

export async function listServiceDocuments(
  serviceId: string,
  options: { includeDeleted?: boolean; kind?: ServiceDocumentKind } = {},
): Promise<ServiceDocument[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    "filter[service_id][_eq]": serviceId,
    sort: "-created_at",
    limit: 200,
  };
  if (!options.includeDeleted) {
    query["filter[deleted_at][_null]"] = "true";
  }
  if (options.kind) {
    query["filter[kind][_eq]"] = options.kind;
  }
  try {
    const rows = await listItems<Row>("mp_service_documents", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listServiceDocuments failed", {
      serviceId,
      err: String(err),
    });
    return [];
  }
}

export async function getServiceDocument(
  documentId: string,
): Promise<ServiceDocument | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<Row>("mp_service_documents", {
      "filter[id][_eq]": documentId,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getServiceDocument failed", {
      documentId,
      err: String(err),
    });
    return null;
  }
}

export async function findServiceDocumentByDocumensoId(
  documensoDocId: number,
): Promise<ServiceDocument | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<Row>("mp_service_documents", {
      "filter[documenso_doc_id][_eq]": documensoDocId,
      sort: "-created_at",
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("findServiceDocumentByDocumensoId failed", {
      documensoDocId,
      err: String(err),
    });
    return null;
  }
}

export interface UpdateServiceDocumentInput {
  title?: string | null;
  signedPdfFileId?: string | null;
  documensoDocId?: number | null;
  documensoSigningUrl?: string | null;
  status?: ServiceDocumentStatus;
  signatureAnchors?: SignatureAnchor[] | null;
}

export async function updateServiceDocument(
  documentId: string,
  patch: UpdateServiceDocumentInput,
): Promise<ServiceDocument | null> {
  if (!(await directusConfigured())) return null;
  // Wave 21 / Faza 1E — gdy patch zmienia status, walidujemy przejście.
  if (patch.status !== undefined) {
    const current = await getServiceDocument(documentId);
    if (
      current &&
      !isServiceDocumentStatusTransitionAllowed(current.status, patch.status)
    ) {
      throw new ServiceDocumentStatusTransitionError(
        current.status,
        patch.status,
      );
    }
  }
  const dbPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.signedPdfFileId !== undefined)
    dbPatch.signed_pdf_file_id = patch.signedPdfFileId;
  if (patch.documensoDocId !== undefined)
    dbPatch.documenso_doc_id = patch.documensoDocId;
  if (patch.documensoSigningUrl !== undefined)
    dbPatch.documenso_signing_url = patch.documensoSigningUrl;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.signatureAnchors !== undefined)
    dbPatch.signature_anchors = patch.signatureAnchors;
  if (Object.keys(dbPatch).length === 0) return getServiceDocument(documentId);
  try {
    const updated = await updateItem<Row>(
      "mp_service_documents",
      documentId,
      dbPatch,
    );
    const mapped = mapRow(updated);
    if (patch.status) {
      publish({
        type: "document_updated",
        serviceId: mapped.serviceId,
        payload: {
          documentId: mapped.id,
          kind: mapped.kind,
          status: mapped.status,
        },
      });
    }
    return mapped;
  } catch (err) {
    if (err instanceof ServiceDocumentStatusTransitionError) throw err;
    logger.warn("updateServiceDocument failed", {
      documentId,
      err: String(err),
    });
    return null;
  }
}

export async function updateServiceDocumentStatus(
  documentId: string,
  status: ServiceDocumentStatus,
): Promise<ServiceDocument | null> {
  return updateServiceDocument(documentId, { status });
}

export async function softDeleteServiceDocument(
  documentId: string,
): Promise<boolean> {
  if (!(await directusConfigured())) return false;
  try {
    const existing = await getServiceDocument(documentId);
    await updateItem("mp_service_documents", documentId, {
      deleted_at: new Date().toISOString(),
    });
    if (existing) {
      publish({
        type: "document_deleted",
        serviceId: existing.serviceId,
        payload: {
          documentId,
          kind: existing.kind,
        },
      });
    }
    return true;
  } catch (err) {
    logger.warn("softDeleteServiceDocument failed", {
      documentId,
      err: String(err),
    });
    return false;
  }
}
