import { getOptionalEnv } from "@/lib/env";

export interface DocusealDocument {
  id: number;
  name: string;
  status: "pending" | "completed" | "declined" | "expired" | "awaiting" | string;
  createdAt: string;
  completedAt?: string;
  signers: Array<{ email: string; status: string; signedAt?: string }>;
  signUrl?: string;
  downloadUrl?: string;
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

async function docusealFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Docuseal not configured (DOCUSEAL_URL / DOCUSEAL_API_KEY)");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { "X-Auth-Token": cfg.apiKey, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Docuseal ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

interface RawSubmitter {
  id: number;
  email: string;
  slug: string;
  status: string;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  submission_id?: number;
  submission?: {
    id: number;
    status?: string;
    audit_log_url?: string;
    completed_at?: string | null;
    created_at?: string;
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
      `/api/submitters?email=${encodeURIComponent(email)}&limit=100`
    );
    return (data.data ?? []).map((sub) => {
      const submission = sub.submission;
      const templateName =
        submission?.template?.name ?? sub.template?.name ?? "Dokument";
      const status = sub.status || submission?.status || "pending";
      const createdAt = sub.created_at || submission?.created_at || new Date().toISOString();
      const completedAt = sub.completed_at ?? submission?.completed_at ?? undefined;
      return {
        id: sub.id,
        name: templateName,
        status,
        createdAt,
        completedAt: completedAt ?? undefined,
        signers: (submission?.submitters ?? [sub]).map((s) => ({
          email: s.email,
          status: s.status,
          signedAt: s.completed_at ?? undefined,
        })),
        signUrl: sub.slug ? `${cfg.baseUrl}/s/${sub.slug}` : undefined,
        downloadUrl: submission?.audit_log_url ?? undefined,
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
    }
  );
  return {
    id: data[0]?.submission_id ?? data[0]?.id ?? 0,
    signerUrls: data.map((s) => s.embed_src).filter((x): x is string => !!x),
  };
}
