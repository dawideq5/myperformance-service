import { getAccountUrl, getAdminUrl } from "@/lib/keycloak-config";

export async function getServiceAccountToken(): Promise<string> {
  const clientId = process.env.KEYCLOAK_SERVICE_CLIENT_ID || process.env.KEYCLOAK_CLIENT_ID!;
  const clientSecret = process.env.KEYCLOAK_SERVICE_CLIENT_SECRET || process.env.KEYCLOAK_CLIENT_SECRET!;

  const response = await fetch(
    `${getAccountUrl("/protocol/openid-connect/token")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("[keycloak-admin] Failed to get service account token:", err);
    throw new Error(`Failed to get service account token: ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function getUserIdFromToken(accessToken: string): Promise<string> {
  const response = await fetch(
    `${getAccountUrl("/protocol/openid-connect/userinfo")}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to get user info");
  }

  const data = await response.json();
  return data.sub;
}

export async function adminRequest(
  path: string,
  adminToken: string,
  options: RequestInit = {}
) {
  const url = `${getAdminUrl(path)}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  return response;
}

export async function appendUserRequiredAction(
  adminToken: string,
  userId: string,
  requiredActionAlias: string
) {
  const userResponse = await adminRequest(`/users/${userId}`, adminToken);
  if (!userResponse.ok) {
    throw new Error("Unable to load user data for required action update");
  }

  const userData = await userResponse.json();
  const requiredActions = new Set<string>(userData.requiredActions || []);
  requiredActions.add(requiredActionAlias);

  const updateResponse = await adminRequest(`/users/${userId}`, adminToken, {
    method: "PUT",
    body: JSON.stringify({
      ...userData,
      requiredActions: Array.from(requiredActions),
    }),
  });

  if (!updateResponse.ok) {
    const details = await updateResponse.text();
    throw new Error(details || "Unable to update required actions");
  }
}

export async function resolveRequiredActionAlias(
  adminToken: string,
  candidates: string[]
) {
  const response = await adminRequest("/authentication/required-actions", adminToken);
  if (!response.ok) {
    throw new Error("Unable to read required actions from Keycloak");
  }

  const providers: Array<{ alias?: string }> = await response.json();
  const aliases = new Set(
    providers
      .map((provider) => provider.alias)
      .filter((alias): alias is string => Boolean(alias))
  );

  return candidates.find((alias) => aliases.has(alias)) || null;
}
