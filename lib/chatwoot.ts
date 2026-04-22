import { getOptionalEnv } from "@/lib/env";

/**
 * Chatwoot SSO bridge.
 *
 * Provisionuje konto w Chatwoot (idempotentnie), ustawia członkostwo
 * w account_users z żądaną rolą (agent | administrator) i zwraca magic
 * link SSO. Zarządzanie custom_roles + live permissions przeniesione
 * do lib/permissions/providers/chatwoot.ts.
 */
export type ChatwootRole = "administrator" | "agent";

interface Config {
  baseUrl: string;
  platformToken: string;
  accountId: number;
}

function getConfig(): Config {
  const baseUrl = (getOptionalEnv("CHATWOOT_URL") ?? "").trim().replace(/\/$/, "");
  const platformToken = (getOptionalEnv("CHATWOOT_PLATFORM_TOKEN") ?? "").trim();
  const accountId = Number(getOptionalEnv("CHATWOOT_ACCOUNT_ID") ?? "1");
  if (!baseUrl || !platformToken) {
    throw new Error("Chatwoot SSO not configured (CHATWOOT_URL, CHATWOOT_PLATFORM_TOKEN)");
  }
  return { baseUrl, platformToken, accountId };
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

interface AccountUserRow {
  account_id: number;
  user_id: number;
  role: ChatwootRole;
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
  // Chatwoot wymaga hasła: upper+lower+digit+special. User nigdy go nie
  // wykorzysta — autoryzacja odbywa się przez SSO bridge.
  const password = generateStrongPassword();
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

async function getCurrentMembershipRole(userId: number): Promise<ChatwootRole | null> {
  const cfg = getConfig();
  const res = await platformFetch(`/platform/api/v1/users/${userId}`);
  if (!res.ok) return null;
  const data = (await res.json()) as ChatwootUser & { accounts?: AccountUserRow[] };
  const match = (data.accounts ?? []).find((a) => a.account_id === cfg.accountId);
  return match?.role ?? null;
}

async function syncAccountMembership(userId: number, desired: ChatwootRole): Promise<void> {
  const cfg = getConfig();
  const current = await getCurrentMembershipRole(userId);

  if (current === desired) return;

  if (current) {
    // Chatwoot Platform API has no UPDATE for account_users; drop membership
    // then recreate with the desired role.
    const del = await platformFetch(
      `/platform/api/v1/accounts/${cfg.accountId}/account_users`,
      {
        method: "DELETE",
        body: JSON.stringify({ user_id: userId }),
      },
    );
    if (!del.ok && del.status !== 404) {
      throw new Error(`Chatwoot drop membership failed: ${del.status}`);
    }
  }

  const create = await platformFetch(
    `/platform/api/v1/accounts/${cfg.accountId}/account_users`,
    {
      method: "POST",
      body: JSON.stringify({ user_id: userId, role: desired }),
    },
  );
  if (create.status === 422) return;
  if (!create.ok) {
    throw new Error(`Chatwoot account membership failed: ${create.status}`);
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

function generateStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const special = "!@#$%^&*()_+-=";
  const all = upper + lower + digit + special;
  const pick = (set: string) =>
    set[
      Math.floor(
        (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * set.length,
      )
    ];
  const required = [pick(upper), pick(lower), pick(digit), pick(special)];
  const rest = Array.from({ length: 20 }, () => pick(all));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(
      (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (i + 1),
    );
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export async function provisionSsoLoginUrl(
  email: string,
  name: string,
  role: ChatwootRole,
): Promise<string> {
  const existing = await findUserByEmail(email);
  const user = existing ?? (await createUser(email, name));
  await syncAccountMembership(user.id, role);
  return await getSsoUrl(user.id);
}
