import { getOptionalEnv } from "@/lib/env";

interface Config {
  baseUrl: string;
  platformToken: string;
  accountId: number;
  defaultRole: "administrator" | "agent";
}

function getConfig(): Config {
  const baseUrl = (getOptionalEnv("CHATWOOT_URL") ?? "").trim().replace(/\/$/, "");
  const platformToken = (getOptionalEnv("CHATWOOT_PLATFORM_TOKEN") ?? "").trim();
  const accountId = Number(getOptionalEnv("CHATWOOT_ACCOUNT_ID") ?? "1");
  const role = (getOptionalEnv("CHATWOOT_DEFAULT_ROLE") ?? "agent").trim();
  if (!baseUrl || !platformToken) {
    throw new Error("Chatwoot SSO not configured (CHATWOOT_URL, CHATWOOT_PLATFORM_TOKEN)");
  }
  return {
    baseUrl,
    platformToken,
    accountId,
    defaultRole: role === "administrator" ? "administrator" : "agent",
  };
}

async function platformFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cfg = getConfig();
  return fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      api_access_token: cfg.platformToken,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

interface ChatwootUser {
  id: number;
  email: string;
  name?: string;
}

async function findUserByEmail(email: string): Promise<ChatwootUser | null> {
  const res = await platformFetch(`/platform/api/v1/users?q=${encodeURIComponent(email)}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as ChatwootUser[] | { data?: ChatwootUser[] };
  const list = Array.isArray(data) ? data : data.data ?? [];
  return list.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function createUser(email: string, name: string): Promise<ChatwootUser> {
  const password = cryptoPassword();
  const res = await platformFetch(`/platform/api/v1/users`, {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      password,
      custom_attributes: { source: "keycloak-sso" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Chatwoot create user failed: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  }
  return (await res.json()) as ChatwootUser;
}

async function ensureAccountMembership(userId: number): Promise<void> {
  const cfg = getConfig();
  const res = await platformFetch(`/platform/api/v1/accounts/${cfg.accountId}/account_users`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, role: cfg.defaultRole }),
  });
  if (res.status === 422) return;
  if (!res.ok) {
    throw new Error(`Chatwoot account membership failed: ${res.status}`);
  }
}

async function getSsoUrl(userId: number): Promise<string> {
  const res = await platformFetch(`/platform/api/v1/users/${userId}/login`);
  if (!res.ok) {
    throw new Error(`Chatwoot SSO login failed: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

function cryptoPassword(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function provisionSsoLoginUrl(email: string, name: string): Promise<string> {
  const existing = await findUserByEmail(email);
  const user = existing ?? (await createUser(email, name));
  await ensureAccountMembership(user.id);
  return await getSsoUrl(user.id);
}

export function isConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}
