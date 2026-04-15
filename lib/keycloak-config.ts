const trimSlash = (value: string) => value.replace(/\/+$/, "");

function resolveRealm() {
  const explicitRealm = process.env.KEYCLOAK_REALM?.trim();
  if (explicitRealm) return explicitRealm;

  const issuer = process.env.KEYCLOAK_ISSUER?.trim();
  if (issuer) {
    const match = issuer.match(/\/realms\/([^/]+)$/i);
    if (match?.[1]) return match[1];
  }

  return "MyPerformance";
}

export function getKeycloakBaseUrl() {
  const keycloakUrl = process.env.KEYCLOAK_URL?.trim();
  if (!keycloakUrl) {
    throw new Error("KEYCLOAK_URL is not configured");
  }
  return trimSlash(keycloakUrl);
}

export function getKeycloakRealm() {
  return resolveRealm();
}

export function getKeycloakIssuer() {
  return `${getKeycloakBaseUrl()}/realms/${getKeycloakRealm()}`;
}

export function getPublicKeycloakIssuer() {
  const issuer = process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER?.trim();
  if (issuer) return trimSlash(issuer);

  const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL?.trim();
  if (!keycloakUrl) {
    return "https://auth.myperformance.pl/realms/MyPerformance";
  }

  return `${trimSlash(keycloakUrl)}/realms/MyPerformance`;
}

export function getAccountUrl(path = "") {
  return `${getKeycloakBaseUrl()}/realms/${getKeycloakRealm()}${path}`;
}

export function getAdminUrl(path = "") {
  return `${getKeycloakBaseUrl()}/admin/realms/${getKeycloakRealm()}${path}`;
}
