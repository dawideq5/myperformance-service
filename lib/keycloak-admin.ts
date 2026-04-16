import { getAccountUrl, getAdminUrl, getKeycloakRealm } from "@/lib/keycloak-config";

export const REALM = getKeycloakRealm();

const REQUIRED_ACTION_ALIAS_MAP: Record<string, string[]> = {
  CONFIGURE_TOTP: ["CONFIGURE_TOTP"],
  WEBAUTHN_REGISTER: ["WEBAUTHN_REGISTER", "webauthn-register"],
};

function getRequiredActionAliases(action: string) {
  return REQUIRED_ACTION_ALIAS_MAP[action] || [action];
}

function canonicalizeRequiredAction(action: string) {
  const normalized = action.toLowerCase();

  if (normalized === "configure_totp") {
    return "CONFIGURE_TOTP";
  }

  if (normalized === "webauthn-register") {
    return "WEBAUTHN_REGISTER";
  }

  return action;
}

export function normalizeRequiredActions(requiredActions: string[] = []) {
  return Array.from(
    new Set(requiredActions.map((action) => canonicalizeRequiredAction(action)))
  );
}

export async function getServiceAccountToken(): Promise<string> {
  // Prefer dedicated service client; fall back to dashboard client
  const clientId =
    process.env.KEYCLOAK_SERVICE_CLIENT_ID ||
    process.env.KEYCLOAK_CLIENT_ID!;
  const clientSecret =
    process.env.KEYCLOAK_SERVICE_CLIENT_SECRET ||
    process.env.KEYCLOAK_CLIENT_SECRET!;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing KEYCLOAK_SERVICE_CLIENT_ID / KEYCLOAK_SERVICE_CLIENT_SECRET (or fallback KEYCLOAK_CLIENT_ID/SECRET)"
    );
  }

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
    console.error(
      `[keycloak-admin] Failed to get service account token (client: ${clientId}):`,
      err
    );
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
  const targetCanonicalAction = canonicalizeRequiredAction(requiredActionAlias);
  const requiredActions = (userData.requiredActions || []).filter(
    (action: string) => canonicalizeRequiredAction(action) !== targetCanonicalAction
  );
  requiredActions.push(requiredActionAlias);

  const updateResponse = await adminRequest(`/users/${userId}`, adminToken, {
    method: "PUT",
    body: JSON.stringify({
      ...userData,
      requiredActions: Array.from(new Set(requiredActions)),
    }),
  });

  if (!updateResponse.ok) {
    const details = await updateResponse.text();
    throw new Error(details || "Unable to update required actions");
  }
}

export async function removeUserRequiredAction(
  adminToken: string,
  userId: string,
  requiredActionAlias: string
) {
  const userResponse = await adminRequest(`/users/${userId}`, adminToken);
  if (!userResponse.ok) {
    throw new Error("Unable to load user data for required action update");
  }

  const userData = await userResponse.json();
  const targetCanonicalAction = canonicalizeRequiredAction(requiredActionAlias);
  const requiredActions = (userData.requiredActions || []).filter(
    (action: string) => canonicalizeRequiredAction(action) !== targetCanonicalAction
  );

  const updateResponse = await adminRequest(`/users/${userId}`, adminToken, {
    method: "PUT",
    body: JSON.stringify({
      ...userData,
      requiredActions,
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

export function getRequiredActionAliasCandidates(action: string) {
  return getRequiredActionAliases(action);
}

export async function updateUserAttributes(
  adminToken: string,
  userId: string,
  attributes: Record<string, string[]>
) {
  const userResponse = await adminRequest(`/users/${userId}`, adminToken);
  if (!userResponse.ok) {
    throw new Error("Unable to load user data for attribute update");
  }

  const userData = await userResponse.json();
  const updateResponse = await adminRequest(`/users/${userId}`, adminToken, {
    method: "PUT",
    body: JSON.stringify({
      ...userData,
      attributes: {
        ...(userData.attributes || {}),
        ...attributes,
      },
    }),
  });

  if (!updateResponse.ok) {
    const details = await updateResponse.text();
    throw new Error(details || "Unable to update user attributes");
  }
}
