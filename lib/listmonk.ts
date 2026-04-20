import { getOptionalEnv } from "@/lib/env";

interface Config {
  baseUrl: string;
  user: string;
  token: string;
}

function getConfig(): Config | null {
  const baseUrl = getOptionalEnv("LISTMONK_URL");
  const user = getOptionalEnv("LISTMONK_API_USER");
  const token = getOptionalEnv("LISTMONK_API_TOKEN");
  if (!baseUrl || !user || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), user, token };
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Listmonk not configured (LISTMONK_URL / LISTMONK_API_USER / LISTMONK_API_TOKEN)");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `token ${cfg.user}:${cfg.token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Listmonk ${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function getHealth(): Promise<boolean> {
  try {
    const r = await call<{ data: boolean }>("/health");
    return r.data === true;
  } catch {
    return false;
  }
}

export interface ListmonkSubscriber {
  email: string;
  name: string;
  listIds?: number[];
  attribs?: Record<string, unknown>;
}

export async function upsertSubscriber(sub: ListmonkSubscriber): Promise<{ id: number }> {
  const data = await call<{ data: { id: number } }>("/api/subscribers", {
    method: "POST",
    body: JSON.stringify({
      email: sub.email,
      name: sub.name,
      status: "enabled",
      lists: sub.listIds ?? [],
      attribs: sub.attribs ?? {},
      preconfirm_subscriptions: true,
    }),
  });
  return { id: data.data.id };
}

export interface TransactionalSend {
  subscriberEmail: string;
  templateId: number;
  data?: Record<string, unknown>;
  contentType?: "html" | "plain" | "markdown";
}

export async function sendTransactional(msg: TransactionalSend): Promise<void> {
  await call<{ data: boolean }>("/api/tx", {
    method: "POST",
    body: JSON.stringify({
      subscriber_email: msg.subscriberEmail,
      template_id: msg.templateId,
      data: msg.data ?? {},
      content_type: msg.contentType ?? "html",
    }),
  });
}
