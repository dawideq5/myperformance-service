export interface KeycloakUser {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
}

function cfg() {
  const issuer = process.env.KEYCLOAK_ISSUER?.replace(/\/$/, "");
  const clientId = process.env.KEYCLOAK_SERVICE_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_SERVICE_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return null;
  const adminBase = issuer.replace(/\/realms\/[^/]+$/, "/admin/realms") +
    "/" + issuer.split("/realms/")[1];
  const tokenUrl = `${issuer}/protocol/openid-connect/token`;
  return { adminBase, tokenUrl, clientId, clientSecret };
}

async function getServiceToken(): Promise<string> {
  const c = cfg();
  if (!c) throw new Error("Keycloak service client not configured");
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
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function listUsersWithRole(roleName: string, max = 100): Promise<KeycloakUser[]> {
  const c = cfg();
  if (!c) return [];
  const token = await getServiceToken();
  const url = `${c.adminBase}/roles/${encodeURIComponent(roleName)}/users?first=0&max=${max}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Keycloak /roles/${roleName}/users ${res.status}`);
  const users = (await res.json()) as Array<{
    id: string;
    email?: string;
    username: string;
    firstName?: string;
    lastName?: string;
  }>;
  return users
    .filter((u) => !!u.email)
    .map((u) => ({
      id: u.id,
      email: u.email as string,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
    }));
}
