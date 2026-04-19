import { getOptionalEnv } from "@/lib/env";

export interface DocusealDocument {
  id: number;
  name: string;
  status: "pending" | "completed" | "declined" | "expired";
  createdAt: string;
  completedAt?: string;
  signers: Array<{ email: string; status: string; signedAt?: string }>;
  downloadUrl?: string;
}

function getConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = getOptionalEnv("DOCUSEAL_URL");
  const apiKey = getOptionalEnv("DOCUSEAL_API_KEY");
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function docusealFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Docuseal not configured (DOCUSEAL_URL / DOCUSEAL_API_KEY)");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { "X-Auth-Token": cfg.apiKey, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Docuseal ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function listSubmissionsForEmail(email: string): Promise<DocusealDocument[]> {
  if (!getConfig()) return [];
  try {
    const data = await docusealFetch<{ data: Array<Record<string, any>> }>(
      `/api/submissions?email=${encodeURIComponent(email)}&per_page=100`
    );
    return (data.data ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? row.template?.name ?? "Dokument",
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      signers: (row.submitters ?? []).map((s: any) => ({
        email: s.email,
        status: s.status,
        signedAt: s.completed_at,
      })),
      downloadUrl: row.audit_log_url,
    }));
  } catch {
    return [];
  }
}

export async function createSubmission(input: {
  templateId: number;
  signers: Array<{ email: string; name?: string }>;
  metadata?: Record<string, unknown>;
}): Promise<{ id: number; signerUrls: string[] }> {
  const data = await docusealFetch<any>("/api/submissions", {
    method: "POST",
    body: JSON.stringify({
      template_id: input.templateId,
      submitters: input.signers.map((s) => ({ email: s.email, name: s.name })),
      metadata: input.metadata,
    }),
  });
  return {
    id: data[0]?.submission_id ?? data.id,
    signerUrls: (data as any[]).map((s) => s.embed_src).filter(Boolean),
  };
}
