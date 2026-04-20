import { getOptionalEnv } from "@/lib/env";

export type DocumensoStatus =
  | "draft"
  | "pending"
  | "completed"
  | "declined"
  | "expired"
  | string;

function normalizeStatus(raw: string | undefined | null): DocumensoStatus {
  switch ((raw ?? "").toUpperCase()) {
    case "COMPLETED":
      return "completed";
    case "REJECTED":
      return "declined";
    case "DRAFT":
      return "draft";
    case "EXPIRED":
      return "expired";
    default:
      return "pending";
  }
}

function normalizeRecipientStatus(raw: string | undefined | null): string {
  switch ((raw ?? "").toUpperCase()) {
    case "SIGNED":
    case "COMPLETED":
      return "completed";
    case "REJECTED":
    case "DECLINED":
      return "declined";
    case "OPENED":
      return "opened";
    case "NOT_OPENED":
    case "SENT":
      return "sent";
    default:
      return "pending";
  }
}

export interface DocumensoDocument {
  id: number;
  name: string;
  status: DocumensoStatus;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
  recipients: Array<{
    id: number;
    email: string;
    name?: string;
    status: string;
    signedAt?: string;
    self?: boolean;
    signingUrl?: string;
  }>;
  downloadUrl?: string;
  auditLogUrl?: string;
  templateName?: string;
}

function getConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = getOptionalEnv("DOCUMENSO_URL");
  const apiKey = getOptionalEnv("DOCUMENSO_API_KEY");
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export function getDocumensoBaseUrl(): string | null {
  return getConfig()?.baseUrl ?? null;
}

export function isDocumensoConfigured() {
  return getConfig() !== null;
}

async function documensoFetch<T>(
  path: string,
  init?: RequestInit & { raw?: boolean },
): Promise<T> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Documenso not configured (DOCUMENSO_URL / DOCUMENSO_API_KEY)");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: cfg.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Documenso ${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  if (init?.raw) return res as unknown as T;
  return res.json() as Promise<T>;
}

interface RawRecipient {
  id: number;
  email: string;
  name?: string | null;
  role?: string;
  signingStatus?: string;
  readStatus?: string;
  sendStatus?: string;
  signedAt?: string | null;
  signingUrl?: string | null;
  token?: string;
}

interface RawDocument {
  id: number;
  title?: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  updatedAt?: string;
  Recipient?: RawRecipient[];
  recipients?: RawRecipient[];
  documentMeta?: { dateFormat?: string; timezone?: string };
  templateId?: number | null;
  auditLogUrl?: string | null;
}

function normalizeRecipient(r: RawRecipient, baseUrl: string, self: boolean): DocumensoDocument["recipients"][number] {
  return {
    id: r.id,
    email: r.email,
    name: r.name ?? undefined,
    status: normalizeRecipientStatus(r.signingStatus ?? r.readStatus ?? r.sendStatus),
    signedAt: r.signedAt ?? undefined,
    self,
    signingUrl: r.signingUrl ?? (r.token ? `${baseUrl}/sign/${r.token}` : undefined),
  };
}

function normalizeDocument(raw: RawDocument, baseUrl: string, email: string | null): DocumensoDocument {
  const recipients = raw.recipients ?? raw.Recipient ?? [];
  const normEmail = email?.toLowerCase();
  const docId = raw.id;
  return {
    id: docId,
    name: raw.title ?? "Dokument",
    status: normalizeStatus(raw.status),
    createdAt: raw.createdAt,
    completedAt: raw.completedAt ?? undefined,
    recipients: recipients.map((r) =>
      normalizeRecipient(r, baseUrl, normEmail ? r.email.toLowerCase() === normEmail : false),
    ),
    downloadUrl: `/api/documents/${docId}/download`,
    auditLogUrl: raw.auditLogUrl ?? undefined,
  };
}

export async function listDocuments(): Promise<DocumensoDocument[]> {
  const cfg = getConfig();
  if (!cfg) return [];
  try {
    const data = await documensoFetch<{ documents: RawDocument[]; totalPages?: number } | RawDocument[]>(
      "/api/v1/documents?page=1&perPage=200",
    );
    const docs = Array.isArray(data) ? data : (data.documents ?? []);
    return docs.map((d) => normalizeDocument(d, cfg.baseUrl, null));
  } catch {
    return [];
  }
}

export async function listDocumentsForEmail(email: string): Promise<DocumensoDocument[]> {
  const all = await listDocuments();
  const needle = email.toLowerCase();
  return all
    .filter((d) => d.recipients.some((r) => r.email.toLowerCase() === needle))
    .map((d) => ({
      ...d,
      recipients: d.recipients.map((r) => ({ ...r, self: r.email.toLowerCase() === needle })),
    }));
}

export async function getDocument(id: number): Promise<DocumensoDocument | null> {
  const cfg = getConfig();
  if (!cfg) return null;
  try {
    const raw = await documensoFetch<RawDocument>(`/api/v1/documents/${id}`);
    return normalizeDocument(raw, cfg.baseUrl, null);
  } catch {
    return null;
  }
}

export async function downloadDocumentPdf(id: number): Promise<Response> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Documenso not configured");
  const res = await fetch(`${cfg.baseUrl}/api/v1/documents/${id}/download`, {
    headers: { Authorization: cfg.apiKey },
    cache: "no-store",
  });
  return res;
}

export interface DocumensoDocumentStats {
  total: number;
  pending: number;
  completed: number;
  declined: number;
  expired: number;
}

export function computeDocumensoStats(docs: DocumensoDocument[]): DocumensoDocumentStats {
  let pending = 0;
  let completed = 0;
  let declined = 0;
  let expired = 0;
  for (const d of docs) {
    switch (d.status) {
      case "completed":
        completed += 1;
        break;
      case "declined":
        declined += 1;
        break;
      case "expired":
        expired += 1;
        break;
      default:
        pending += 1;
    }
  }
  return { total: docs.length, pending, completed, declined, expired };
}
