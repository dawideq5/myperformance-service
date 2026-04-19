export interface DocusealTemplate {
  id: number;
  name: string;
  createdAt: string;
  fieldsCount: number;
}

export interface DocusealSubmission {
  id: number;
  name: string;
  status: "pending" | "completed" | "declined" | "expired";
  createdAt: string;
  submitters: Array<{ email: string; status: string; completedAt?: string }>;
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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new Error(`Docuseal ${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function listTemplates(): Promise<DocusealTemplate[]> {
  if (!isConfigured()) return [];
  try {
    const data = await call<{ data: any[] }>("/api/templates?per_page=100");
    return (data.data ?? []).map((t) => ({
      id: t.id,
      name: t.name ?? "Szablon",
      createdAt: t.created_at,
      fieldsCount: (t.fields ?? []).length,
    }));
  } catch {
    return [];
  }
}

export async function listSubmissions(): Promise<DocusealSubmission[]> {
  if (!isConfigured()) return [];
  try {
    const data = await call<{ data: any[] }>("/api/submissions?per_page=100");
    return (data.data ?? []).map((s) => ({
      id: s.id,
      name: s.name ?? s.template?.name ?? "Dokument",
      status: s.status,
      createdAt: s.created_at,
      submitters: (s.submitters ?? []).map((sub: any) => ({
        email: sub.email,
        status: sub.status,
        completedAt: sub.completed_at,
      })),
    }));
  } catch {
    return [];
  }
}

export async function uploadPdfTemplate(args: {
  name: string;
  pdfBase64: string;
}): Promise<{ id: number; editUrl: string }> {
  const cfg = config();
  if (!cfg) throw new Error("Docuseal niepodłączony");
  const data = await call<any>("/api/templates/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: args.name,
      documents: [{ name: args.name, file: args.pdfBase64 }],
    }),
  });
  return { id: data.id, editUrl: `${cfg.baseUrl}/templates/${data.id}` };
}

export async function createSubmission(args: {
  templateId: number;
  submitters: Array<{ email: string; name?: string; role?: string }>;
  sendEmail?: boolean;
}): Promise<Array<{ email: string; embedSrc?: string; status: string }>> {
  const data = await call<any[]>("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      template_id: args.templateId,
      send_email: args.sendEmail ?? true,
      submitters: args.submitters.map((s) => ({
        email: s.email,
        name: s.name,
        role: s.role ?? "Podpisujący",
      })),
    }),
  });
  return data.map((s) => ({ email: s.email, embedSrc: s.embed_src, status: s.status }));
}
