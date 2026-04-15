const trimSlash = (value: string) => value.replace(/\/+$/, "");

function getConfiguredIssuer() {
  const issuer = process.env.KEYCLOAK_ISSUER?.trim();
  return issuer ? trimSlash(issuer) : "";
}

function resolveRealm() {
  const explicitRealm = process.env.KEYCLOAK_REALM?.trim();
  if (explicitRealm) return explicitRealm;

  const issuer = getConfiguredIssuer();
  if (issuer) {
    const match = issuer.match(/\/realms\/([^/]+)$/i);
    if (match?.[1]) return match[1];
  }

  return "MyPerformance";
}

export function getKeycloakBaseUrl() {
  const keycloakUrl = process.env.KEYCLOAK_URL?.trim();
  if (keycloakUrl) {
    return trimSlash(keycloakUrl);
  }

  const issuer = getConfiguredIssuer();
  if (issuer) {
    const match = issuer.match(/^(https?:\/\/.+?)\/realms\/[^/]+$/i);
    if (match?.[1]) return trimSlash(match[1]);
  }

  throw new Error("KEYCLOAK_URL or KEYCLOAK_ISSUER is not configured");
}

export function getKeycloakRealm() {
  return resolveRealm();
}

export function getKeycloakIssuer() {
  const issuer = getConfiguredIssuer();
  if (issuer) return issuer;

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
