export interface DocumensoTemplateSummary {
  id: number;
  name: string;
  createdAt: string;
  updatedAt?: string;
  fieldsCount: number;
  submissionsCount?: number;
  folderName?: string;
  archivedAt?: string | null;
  editUrl: string;
}

export interface DocumensoRecipient {
  id: number;
  email: string;
  name?: string;
  role?: string;
  status: string;
  completedAt?: string;
  sentAt?: string;
  openedAt?: string;
  signedAt?: string;
  declineReason?: string;
  signUrl?: string;
}

export type DocumensoStatus =
  | "pending"
  | "completed"
  | "declined"
  | "expired"
  | "draft"
  | string;

export interface DocumensoSubmissionSummary {
  id: number;
  name: string;
  status: DocumensoStatus;
  createdAt: string;
  completedAt?: string;
  expiredAt?: string;
  archivedAt?: string | null;
  templateId?: number;
  templateName?: string;
  auditLogUrl?: string;
  openUrl?: string;
  submitters: DocumensoRecipient[];
}

export interface DocumensoDocumentFile {
  name: string;
  url: string;
}

function config() {
  const baseUrl = process.env.DOCUMENSO_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUMENSO_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

export function isConfigured() {
  return config() !== null;
}

export function getBaseUrl() {
  return config()?.baseUrl ?? null;
}

async function call<T>(
  path: string,
  init?: RequestInit & { raw?: boolean },
): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("Documenso niepodłączony — ustaw DOCUMENSO_URL i DOCUMENSO_API_KEY");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: cfg.apiKey,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Documenso ${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  if (init?.raw) return res as unknown as T;
  return res.json() as Promise<T>;
}

function normalizeStatus(raw: string | undefined | null): DocumensoStatus {
  switch ((raw ?? "").toUpperCase()) {
    case "COMPLETED":
      return "completed";
    case "REJECTED":
    case "DECLINED":
      return "declined";
    case "EXPIRED":
      return "expired";
    case "DRAFT":
      return "draft";
    default:
      return "pending";
  }
}

function normalizeRecipientStatus(r: any): string {
  const signing = (r.signingStatus ?? "").toUpperCase();
  const sending = (r.sendStatus ?? "").toUpperCase();
  if (signing === "SIGNED" || signing === "COMPLETED") return "completed";
  if (signing === "REJECTED" || signing === "DECLINED") return "declined";
  if (signing === "OPENED") return "opened";
  if (sending === "SENT" || signing === "NOT_SIGNED") return "sent";
  return "pending";
}

function mapRecipient(raw: any, baseUrl: string): DocumensoRecipient {
  const token: string | undefined = raw.token ?? raw.Recipient?.token;
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name ?? undefined,
    role: raw.role ?? undefined,
    status: normalizeRecipientStatus(raw),
    completedAt: raw.signedAt ?? raw.completedAt ?? undefined,
    sentAt: raw.sentAt ?? undefined,
    openedAt: raw.readAt ?? raw.openedAt ?? undefined,
    signedAt: raw.signedAt ?? undefined,
    declineReason: raw.rejectionReason ?? raw.declineReason ?? undefined,
    signUrl: raw.signingUrl ?? (token ? `${baseUrl}/sign/${token}` : undefined),
  };
}

function mapDocument(raw: any, baseUrl: string): DocumensoSubmissionSummary {
  const recipients = raw.recipients ?? raw.Recipient ?? [];
  return {
    id: raw.id,
    name: raw.title ?? "Dokument",
    status: normalizeStatus(raw.status),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    completedAt: raw.completedAt ?? undefined,
    expiredAt: raw.expiresAt ?? raw.documentMeta?.expiresAt ?? undefined,
    archivedAt: raw.deletedAt ?? null,
    templateId: raw.templateId ?? raw.template?.id ?? undefined,
    templateName: raw.template?.title ?? raw.templateMeta?.title ?? undefined,
    auditLogUrl: raw.auditLogUrl ?? undefined,
    openUrl: `${baseUrl}/documents/${raw.id}`,
    submitters: recipients.map((r: any) => mapRecipient(r, baseUrl)),
  };
}

function mapTemplate(raw: any, baseUrl: string): DocumensoTemplateSummary {
  const fields = raw.Field ?? raw.fields ?? [];
  return {
    id: raw.id,
    name: raw.title ?? "Szablon",
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt ?? undefined,
    fieldsCount: Array.isArray(fields) ? fields.length : 0,
    submissionsCount: raw._count?.document ?? undefined,
    folderName: raw.folder?.name ?? undefined,
    archivedAt: raw.deletedAt ?? null,
    editUrl: `${baseUrl}/templates/${raw.id}`,
  };
}

export async function listTemplates(): Promise<DocumensoTemplateSummary[]> {
  const cfg = config();
  if (!cfg) return [];
  try {
    const data = await call<{ templates?: any[]; data?: any[] } | any[]>(
      "/api/v1/templates?page=1&perPage=100",
    );
    const items = Array.isArray(data) ? data : (data.templates ?? data.data ?? []);
    return items.map((t) => mapTemplate(t, cfg.baseUrl));
  } catch {
    return [];
  }
}

export async function listSubmissions(): Promise<DocumensoSubmissionSummary[]> {
  const cfg = config();
  if (!cfg) return [];
  try {
    const data = await call<{ documents?: any[]; data?: any[] } | any[]>(
      "/api/v1/documents?page=1&perPage=200",
    );
    const items = Array.isArray(data) ? data : (data.documents ?? data.data ?? []);
    return items.map((d) => mapDocument(d, cfg.baseUrl));
  } catch {
    return [];
  }
}

export async function getSubmission(id: number): Promise<DocumensoSubmissionSummary | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const raw = await call<any>(`/api/v1/documents/${id}`);
    return mapDocument(raw, cfg.baseUrl);
  } catch {
    return null;
  }
}

export async function archiveSubmission(id: number): Promise<void> {
  await call<unknown>(`/api/v1/documents/${id}`, { method: "DELETE" });
}

export async function archiveTemplate(id: number): Promise<void> {
  await call<unknown>(`/api/v1/templates/${id}`, { method: "DELETE" });
}

export async function cloneTemplate(
  id: number,
  name?: string,
): Promise<{ id: number; editUrl: string }> {
  const cfg = config();
  if (!cfg) throw new Error("Documenso niepodłączony");
  const data = await call<any>(`/api/v1/templates/${id}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(name ? { title: name } : {}),
  });
  const newId = data?.templateId ?? data?.id;
  return { id: newId, editUrl: `${cfg.baseUrl}/templates/${newId}` };
}

export async function uploadPdfTemplate(_args: {
  name: string;
  pdfBase64: string;
  folderName?: string;
}): Promise<{ id: number; editUrl: string }> {
  const cfg = config();
  if (!cfg) throw new Error("Documenso niepodłączony");
  throw new Error(
    `Tworzenie nowego szablonu z PDF odbywa się w interfejsie Documenso (${cfg.baseUrl}/templates/create). Po dodaniu pól szablon pojawi się w panelu.`,
  );
}

export async function createSubmission(args: {
  templateId: number;
  submitters: Array<{ email: string; name?: string; role?: string }>;
  sendEmail?: boolean;
  subject?: string;
  message?: string;
  order?: "preserved" | "random";
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}): Promise<DocumensoSubmissionSummary> {
  const cfg = config();
  if (!cfg) throw new Error("Documenso niepodłączony");

  const created = await call<any>(
    `/api/v1/templates/${args.templateId}/generate-document`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipients: args.submitters.map((s, idx) => ({
          id: idx + 1,
          email: s.email,
          name: s.name ?? s.email,
          role: (s.role ?? "SIGNER").toUpperCase(),
          signingOrder: args.order === "preserved" ? idx + 1 : undefined,
        })),
        meta: {
          subject: args.subject,
          message: args.message,
          signingOrder: args.order === "preserved" ? "SEQUENTIAL" : "PARALLEL",
          ...(args.expiresAt ? { dateFormat: "yyyy-MM-dd HH:mm" } : {}),
        },
        distributeDocument: args.sendEmail !== false,
      }),
    },
  );

  const docId: number | undefined = created?.documentId ?? created?.id;
  if (!docId) {
    throw new Error("Documenso nie zwróciło identyfikatora dokumentu");
  }

  if (args.sendEmail !== false && created?.recipients) {
    try {
      await call<unknown>(`/api/v1/documents/${docId}/send-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendEmail: true }),
      });
    } catch {
      /* send endpoint may return non-ok on already-sent docs; non-fatal */
    }
  }

  const full = await getSubmission(docId);
  if (full) return full;
  return {
    id: docId,
    name: args.subject ?? "Dokument",
    status: "pending",
    createdAt: new Date().toISOString(),
    submitters: [],
  };
}

export async function resendSubmitter(recipientId: number): Promise<void> {
  await call<unknown>(`/api/v1/recipients/${recipientId}/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).catch(async () => {
    await call<unknown>(`/api/v1/recipients/${recipientId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  });
}

export async function getSubmissionDocuments(id: number): Promise<DocumensoDocumentFile[]> {
  const cfg = config();
  if (!cfg) return [];
  return [
    {
      name: `document-${id}.pdf`,
      url: `${cfg.baseUrl}/api/v1/documents/${id}/download`,
    },
  ];
}

export async function proxyFetch(url: string): Promise<Response> {
  const cfg = config();
  if (!cfg) throw new Error("Documenso niepodłączony");
  return fetch(url, {
    headers: { Authorization: cfg.apiKey },
    cache: "no-store",
  });
}

export async function downloadDocumentPdf(id: number): Promise<Response> {
  const cfg = config();
  if (!cfg) throw new Error("Documenso niepodłączony");
  return fetch(`${cfg.baseUrl}/api/v1/documents/${id}/download`, {
    headers: { Authorization: cfg.apiKey },
    cache: "no-store",
  });
}

export interface WebhookConfig {
  id?: string | number;
  url: string;
  events: string[];
}

export async function listWebhooks(): Promise<WebhookConfig[]> {
  try {
    const data = await call<any>("/api/v1/webhooks");
    const items = Array.isArray(data) ? data : data?.webhooks ?? data?.data ?? [];
    return items.map((w: any) => ({
      id: w.id,
      url: w.webhookUrl ?? w.url,
      events: w.eventTriggers ?? w.events ?? [],
    }));
  } catch {
    return [];
  }
}

export async function upsertWebhook(cfg: WebhookConfig): Promise<WebhookConfig> {
  const method = cfg.id ? "PATCH" : "POST";
  const path = cfg.id ? `/api/v1/webhooks/${cfg.id}` : "/api/v1/webhooks";
  const data = await call<any>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl: cfg.url,
      eventTriggers: cfg.events,
      enabled: true,
    }),
  });
  return {
    id: data?.id ?? cfg.id,
    url: data?.webhookUrl ?? cfg.url,
    events: data?.eventTriggers ?? cfg.events,
  };
}

export async function deleteWebhook(id: string | number): Promise<void> {
  await call<unknown>(`/api/v1/webhooks/${id}`, { method: "DELETE" });
}

export interface SubmissionStats {
  total: number;
  pending: number;
  completed: number;
  declined: number;
  expired: number;
  last7d: number;
  completionRate: number;
}

export function computeStats(subs: DocumensoSubmissionSummary[]): SubmissionStats {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  let completed = 0;
  let pending = 0;
  let declined = 0;
  let expired = 0;
  let last7d = 0;
  for (const s of subs) {
    const t = new Date(s.createdAt).getTime();
    if (!Number.isNaN(t) && t >= weekAgo) last7d += 1;
    switch (s.status) {
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
  const total = subs.length;
  const completionRate = total > 0 ? completed / total : 0;
  return { total, pending, completed, declined, expired, last7d, completionRate };
}
