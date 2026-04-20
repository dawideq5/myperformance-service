import { getOptionalEnv } from "@/lib/env";

export type DocusealStatus =
  | "pending"
  | "completed"
  | "declined"
  | "expired"
  | "awaiting"
  | "sent"
  | "opened"
  | string;

export interface DocusealDocument {
  id: number;
  submissionId?: number;
  submitterId: number;
  name: string;
  status: DocusealStatus;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
  signers: Array<{
    id: number;
    email: string;
    name?: string;
    status: string;
    signedAt?: string;
    self?: boolean;
  }>;
  signUrl?: string;
  embedSrc?: string;
  downloadUrl?: string;
  auditLogUrl?: string;
  templateName?: string;
}

function getConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = getOptionalEnv("DOCUSEAL_URL");
  const apiKey = getOptionalEnv("DOCUSEAL_API_KEY");
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export function getDocusealBaseUrl(): string | null {
  const cfg = getConfig();
  return cfg?.baseUrl ?? null;
}

export function isDocusealConfigured() {
  return getConfig() !== null;
}

async function docusealFetch<T>(
  path: string,
  init?: RequestInit & { raw?: boolean },
): Promise<T> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Docuseal not configured (DOCUSEAL_URL / DOCUSEAL_API_KEY)");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "X-Auth-Token": cfg.apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Docuseal ${path} → ${res.status}`);
  if (init?.raw) return res as unknown as T;
  return res.json() as Promise<T>;
}

interface RawSubmitter {
  id: number;
  email: string;
  name?: string;
  slug: string;
  status: string;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  submission_id?: number;
  embed_src?: string;
  submission?: {
    id: number;
    status?: string;
    audit_log_url?: string;
    completed_at?: string | null;
    created_at?: string;
    expire_at?: string | null;
    template?: { id: number; name?: string };
    submitters?: RawSubmitter[];
  };
  template?: { id: number; name?: string };
}

export async function listSubmissionsForEmail(email: string): Promise<DocusealDocument[]> {
  const cfg = getConfig();
  if (!cfg) return [];
  try {
    const data = await docusealFetch<{ data: RawSubmitter[] }>(
      `/api/submitters?email=${encodeURIComponent(email)}&limit=200`,
    );
    const normalizedEmail = email.toLowerCase();
    return (data.data ?? []).map((sub) => {
      const submission = sub.submission;
      const templateName = submission?.template?.name ?? sub.template?.name ?? "Dokument";
      const status = sub.status || submission?.status || "pending";
      const createdAt = sub.created_at || submission?.created_at || new Date().toISOString();
      const completedAt = sub.completed_at ?? submission?.completed_at ?? undefined;
      return {
        id: submission?.id ?? sub.submission_id ?? sub.id,
        submissionId: submission?.id ?? sub.submission_id,
        submitterId: sub.id,
        name: templateName,
        status,
        createdAt,
        completedAt: completedAt ?? undefined,
        expiresAt: submission?.expire_at ?? undefined,
        signers: (submission?.submitters ?? [sub]).map((s) => ({
          id: s.id,
          email: s.email,
          name: s.name,
          status: s.status,
          signedAt: s.completed_at ?? undefined,
          self: s.email.toLowerCase() === normalizedEmail,
        })),
        signUrl: sub.slug ? `${cfg.baseUrl}/s/${sub.slug}` : undefined,
        embedSrc: sub.embed_src,
        downloadUrl: submission?.id ? `/api/documents/${submission.id}/download` : undefined,
        auditLogUrl: submission?.audit_log_url ?? undefined,
        templateName,
      };
    });
  } catch {
    return [];
  }
}

export async function createSubmission(input: {
  templateId: number;
  signers: Array<{ email: string; name?: string }>;
  metadata?: Record<string, unknown>;
}): Promise<{ id: number; signerUrls: string[] }> {
  const data = await docusealFetch<Array<{ submission_id?: number; id?: number; embed_src?: string }>>(
    "/api/submissions",
    {
      method: "POST",
      body: JSON.stringify({
        template_id: input.templateId,
        submitters: input.signers.map((s) => ({ email: s.email, name: s.name })),
        metadata: input.metadata,
      }),
    },
  );
  return {
    id: data[0]?.submission_id ?? data[0]?.id ?? 0,
    signerUrls: data.map((s) => s.embed_src).filter((x): x is string => !!x),
  };
}

export async function getSubmissionDocuments(
  submissionId: number,
): Promise<Array<{ name: string; url: string }>> {
  try {
    const raw = await docusealFetch<{ documents?: Array<{ name: string; url: string }> }>(
      `/api/submissions/${submissionId}/documents`,
    );
    return (raw.documents ?? []).map((d) => ({ name: d.name, url: d.url }));
  } catch {
    return [];
  }
}

export async function proxyDocusealFetch(url: string): Promise<Response> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Docuseal not configured");
  return fetch(url, {
    headers: { "X-Auth-Token": cfg.apiKey },
    cache: "no-store",
  });
}

export interface DocumentStats {
  total: number;
  pending: number;
  completed: number;
  declined: number;
  expired: number;
}

export function computeDocumentStats(docs: DocusealDocument[]): DocumentStats {
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
