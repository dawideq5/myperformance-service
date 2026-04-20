export interface DocusealTemplateSummary {
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

export interface DocusealSubmitter {
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
  embedSrc?: string;
  signUrl?: string;
}

export type DocusealStatus =
  | "pending"
  | "completed"
  | "declined"
  | "expired"
  | "awaiting"
  | "sent"
  | "opened"
  | string;

export interface DocusealSubmissionSummary {
  id: number;
  name: string;
  status: DocusealStatus;
  createdAt: string;
  completedAt?: string;
  expiredAt?: string;
  archivedAt?: string | null;
  templateId?: number;
  templateName?: string;
  auditLogUrl?: string;
  openUrl?: string;
  submitters: DocusealSubmitter[];
}

export interface DocusealDocumentFile {
  name: string;
  url: string;
}

function config() {
  const baseUrl = process.env.DOCUSEAL_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
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
  if (!cfg) throw new Error("Docuseal niepodłączony — ustaw DOCUSEAL_URL i DOCUSEAL_API_KEY");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "X-Auth-Token": cfg.apiKey,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Docuseal ${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  if (init?.raw) return res as unknown as T;
  return res.json() as Promise<T>;
}

function mapSubmitter(raw: any, baseUrl: string): DocusealSubmitter {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name ?? undefined,
    role: raw.role ?? undefined,
    status: raw.status,
    completedAt: raw.completed_at ?? undefined,
    sentAt: raw.sent_at ?? undefined,
    openedAt: raw.opened_at ?? undefined,
    signedAt: raw.completed_at ?? undefined,
    declineReason: raw.decline_reason ?? undefined,
    embedSrc: raw.embed_src ?? undefined,
    signUrl: raw.slug ? `${baseUrl}/s/${raw.slug}` : undefined,
  };
}

function mapSubmission(raw: any, baseUrl: string): DocusealSubmissionSummary {
  return {
    id: raw.id,
    name: raw.name ?? raw.template?.name ?? "Dokument",
    status: raw.status ?? "pending",
    createdAt: raw.created_at,
    completedAt: raw.completed_at ?? undefined,
    expiredAt: raw.expire_at ?? undefined,
    archivedAt: raw.archived_at ?? null,
    templateId: raw.template?.id,
    templateName: raw.template?.name,
    auditLogUrl: raw.audit_log_url ?? undefined,
    openUrl: `${baseUrl}/submissions/${raw.id}`,
    submitters: (raw.submitters ?? []).map((s: any) => mapSubmitter(s, baseUrl)),
  };
}

export async function listTemplates(): Promise<DocusealTemplateSummary[]> {
  const cfg = config();
  if (!cfg) return [];
  try {
    const data = await call<{ data: any[] }>("/api/templates?per_page=100");
    return (data.data ?? []).map((t) => ({
      id: t.id,
      name: t.name ?? "Szablon",
      createdAt: t.created_at,
      updatedAt: t.updated_at ?? undefined,
      fieldsCount: (t.fields ?? []).length,
      submissionsCount: t.submissions_count ?? undefined,
      folderName: t.folder_name ?? undefined,
      archivedAt: t.archived_at ?? null,
      editUrl: `${cfg.baseUrl}/templates/${t.id}`,
    }));
  } catch {
    return [];
  }
}

export async function listSubmissions(): Promise<DocusealSubmissionSummary[]> {
  const cfg = config();
  if (!cfg) return [];
  try {
    const data = await call<{ data: any[] }>("/api/submissions?per_page=200");
    return (data.data ?? []).map((s) => mapSubmission(s, cfg.baseUrl));
  } catch {
    return [];
  }
}

export async function getSubmission(id: number): Promise<DocusealSubmissionSummary | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const raw = await call<any>(`/api/submissions/${id}`);
    return mapSubmission(raw, cfg.baseUrl);
  } catch {
    return null;
  }
}

export async function archiveSubmission(id: number): Promise<void> {
  await call<unknown>(`/api/submissions/${id}`, { method: "DELETE" });
}

export async function archiveTemplate(id: number): Promise<void> {
  await call<unknown>(`/api/templates/${id}`, { method: "DELETE" });
}

export async function uploadPdfTemplate(args: {
  name: string;
  pdfBase64: string;
  folderName?: string;
}): Promise<{ id: number; editUrl: string }> {
  const cfg = config();
  if (!cfg) throw new Error("Docuseal niepodłączony");
  const data = await call<any>("/api/templates/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: args.name,
      folder_name: args.folderName,
      documents: [{ name: args.name, file: args.pdfBase64 }],
    }),
  });
  return { id: data.id, editUrl: `${cfg.baseUrl}/templates/${data.id}` };
}

export async function cloneTemplate(id: number, name?: string): Promise<{ id: number; editUrl: string }> {
  const cfg = config();
  if (!cfg) throw new Error("Docuseal niepodłączony");
  const data = await call<any>(`/api/templates/${id}/clone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
  });
  return { id: data.id, editUrl: `${cfg.baseUrl}/templates/${data.id}` };
}

export async function createSubmission(args: {
  templateId: number;
  submitters: Array<{ email: string; name?: string; role?: string }>;
  sendEmail?: boolean;
  sendSms?: boolean;
  subject?: string;
  message?: string;
  order?: "preserved" | "random";
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}): Promise<DocusealSubmissionSummary> {
  const cfg = config();
  if (!cfg) throw new Error("Docuseal niepodłączony");
  const data = await call<any[]>("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      template_id: args.templateId,
      send_email: args.sendEmail ?? true,
      send_sms: args.sendSms ?? false,
      message: args.message,
      subject: args.subject,
      order: args.order,
      expire_at: args.expiresAt,
      metadata: args.metadata,
      submitters: args.submitters.map((s) => ({
        email: s.email,
        name: s.name,
        role: s.role ?? "Podpisujący",
      })),
    }),
  });
  const firstSubmissionId = data[0]?.submission_id ?? data[0]?.id;
  if (!firstSubmissionId) {
    return {
      id: 0,
      name: args.submitters.map((s) => s.email).join(", "),
      status: "pending",
      createdAt: new Date().toISOString(),
      submitters: data.map((s) => mapSubmitter(s, cfg.baseUrl)),
    };
  }
  const full = await getSubmission(firstSubmissionId);
  if (full) return full;
  return {
    id: firstSubmissionId,
    name: "Dokument",
    status: "pending",
    createdAt: new Date().toISOString(),
    submitters: data.map((s) => mapSubmitter(s, cfg.baseUrl)),
  };
}

export async function resendSubmitter(submitterId: number): Promise<void> {
  await call<unknown>(`/api/submitters/${submitterId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ send_email: true }),
  });
}

export async function getSubmissionDocuments(id: number): Promise<DocusealDocumentFile[]> {
  try {
    const raw = await call<{ documents?: Array<{ name: string; url: string }> }>(
      `/api/submissions/${id}/documents`,
    );
    return (raw.documents ?? []).map((d) => ({ name: d.name, url: d.url }));
  } catch {
    return [];
  }
}

export async function proxyFetch(url: string): Promise<Response> {
  const cfg = config();
  if (!cfg) throw new Error("Docuseal niepodłączony");
  return fetch(url, {
    headers: { "X-Auth-Token": cfg.apiKey },
    cache: "no-store",
  });
}

export interface WebhookConfig {
  id?: number;
  url: string;
  events: string[];
}

export async function listWebhooks(): Promise<WebhookConfig[]> {
  try {
    const data = await call<any>("/api/webhooks");
    const items = Array.isArray(data) ? data : data?.data ?? [];
    return items.map((w: any) => ({
      id: w.id,
      url: w.url,
      events: w.events ?? [],
    }));
  } catch {
    return [];
  }
}

export async function upsertWebhook(cfg: WebhookConfig): Promise<WebhookConfig> {
  const method = cfg.id ? "PUT" : "POST";
  const path = cfg.id ? `/api/webhooks/${cfg.id}` : "/api/webhooks";
  const data = await call<any>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: cfg.url, events: cfg.events }),
  });
  return { id: data?.id, url: data?.url ?? cfg.url, events: data?.events ?? cfg.events };
}

export async function deleteWebhook(id: number): Promise<void> {
  await call<unknown>(`/api/webhooks/${id}`, { method: "DELETE" });
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

export function computeStats(subs: DocusealSubmissionSummary[]): SubmissionStats {
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
