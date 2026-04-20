export interface KeycloakUser {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  roles: string[];
  lastActiveAt?: number;
  online: boolean;
}

function cfg() {
  const issuer = process.env.KEYCLOAK_ISSUER?.replace(/\/$/, "");
  const clientId = process.env.KEYCLOAK_SERVICE_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_SERVICE_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return null;
  const realm = issuer.split("/realms/")[1];
  const base = issuer.replace(/\/realms\/[^/]+$/, "/admin/realms") + "/" + realm;
  const tokenUrl = `${issuer}/protocol/openid-connect/token`;
  return { adminBase: base, tokenUrl, clientId, clientSecret };
}

export function isKeycloakConfigured() {
  return cfg() !== null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getServiceToken(): Promise<string> {
  const c = cfg();
  if (!c) throw new Error("Keycloak service client not configured");
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 30) return cachedToken.token;
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Keycloak token ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in ?? 60) };
  return data.access_token;
}

async function kcFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const c = cfg();
  if (!c) throw new Error("Keycloak service client not configured");
  const token = await getServiceToken();
  const res = await fetch(`${c.adminBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Keycloak ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export async function listUsersWithRole(roleName: string, max = 200): Promise<KeycloakUser[]> {
  if (!cfg()) return [];
  const users = await kcFetch<Array<any>>(
    `/roles/${encodeURIComponent(roleName)}/users?first=0&max=${max}`,
  );
  return users
    .filter((u) => !!u.email)
    .map((u) => ({
      id: u.id,
      email: u.email as string,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      enabled: u.enabled ?? true,
      roles: [roleName],
      online: false,
    }));
}

export async function listAllUsers(max = 500): Promise<KeycloakUser[]> {
  if (!cfg()) return [];
  const users = await kcFetch<Array<any>>(`/users?first=0&max=${max}&enabled=true`);
  return users
    .filter((u) => !!u.email)
    .map((u) => ({
      id: u.id,
      email: u.email as string,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      enabled: u.enabled ?? true,
      roles: [],
      online: false,
    }));
}

export async function enrichWithPresence(users: KeycloakUser[]): Promise<KeycloakUser[]> {
  if (!cfg() || users.length === 0) return users;
  const now = Date.now();
  const results = await Promise.all(
    users.map(async (u) => {
      try {
        const sessions = await kcFetch<Array<{ lastAccess?: number }>>(
          `/users/${u.id}/sessions`,
        );
        const last = sessions.reduce(
          (m, s) => Math.max(m, (s.lastAccess ?? 0) * 1000),
          0,
        );
        return { ...u, lastActiveAt: last || undefined, online: last > 0 && now - last < ONLINE_WINDOW_MS };
      } catch {
        return u;
      }
    }),
  );
  return results;
}

export async function enrichWithRoles(users: KeycloakUser[]): Promise<KeycloakUser[]> {
  if (!cfg() || users.length === 0) return users;
  const results = await Promise.all(
    users.map(async (u) => {
      try {
        const mappings = await kcFetch<{ realmMappings?: Array<{ name: string }> }>(
          `/users/${u.id}/role-mappings`,
        );
        const roleNames = (mappings.realmMappings ?? []).map((r) => r.name);
        return { ...u, roles: roleNames };
      } catch {
        return u;
      }
    }),
  );
  return results;
}
