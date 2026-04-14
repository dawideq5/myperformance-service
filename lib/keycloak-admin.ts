const KEYCLOAK_URL = process.env.KEYCLOAK_URL!;
const REALM = "MyPerformance";

export async function getServiceAccountToken(): Promise<string> {
  const clientId = process.env.KEYCLOAK_SERVICE_CLIENT_ID || process.env.KEYCLOAK_CLIENT_ID!;
  const clientSecret = process.env.KEYCLOAK_SERVICE_CLIENT_SECRET || process.env.KEYCLOAK_CLIENT_SECRET!;

  const response = await fetch(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
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
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/userinfo`,
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
  const url = `${KEYCLOAK_URL}/admin/realms/${REALM}${path}`;
  console.log("[keycloak-admin]", options.method || "GET", url);

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
