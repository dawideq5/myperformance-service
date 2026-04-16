export class KeycloakService {
  private static instance: KeycloakService;

  private constructor() {}

  public static getInstance(): KeycloakService {
    if (!KeycloakService.instance) {
      KeycloakService.instance = new KeycloakService();
    }
    return KeycloakService.instance;
  }

  private trimSlash(value: string) {
    return value.replace(/\/+$/, "");
  }

  public getConfiguredIssuer() {
    const issuer = process.env.KEYCLOAK_ISSUER?.trim();
    return issuer ? this.trimSlash(issuer) : "";
  }

  public getRealm() {
    const explicitRealm = process.env.KEYCLOAK_REALM?.trim();
    if (explicitRealm) return explicitRealm;

    const issuer = this.getConfiguredIssuer();
    if (issuer) {
      const match = issuer.match(/\/realms\/([^/]+)$/i);
      if (match?.[1]) return match[1];
    }

    return "MyPerformance";
  }

  public getBaseUrl() {
    const keycloakUrl = process.env.KEYCLOAK_URL?.trim();
    if (keycloakUrl) {
      return this.trimSlash(keycloakUrl);
    }

    const issuer = this.getConfiguredIssuer();
    if (issuer) {
      const match = issuer.match(/^(https?:\/\/.+?)\/realms\/[^/]+$/i);
      if (match?.[1]) return this.trimSlash(match[1]);
    }

    throw new Error("KEYCLOAK_URL or KEYCLOAK_ISSUER is not configured");
  }

  public getIssuer() {
    const issuer = this.getConfiguredIssuer();
    if (issuer) return issuer;

    return `${this.getBaseUrl()}/realms/${this.getRealm()}`;
  }

  public getPublicIssuer() {
    const issuer = process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER?.trim();
    if (issuer) return this.trimSlash(issuer);

    const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL?.trim();
    if (!keycloakUrl) {
      return "https://auth.myperformance.pl/realms/MyPerformance";
    }

    return `${this.trimSlash(keycloakUrl)}/realms/MyPerformance`;
  }

  public getAccountUrl(path = "") {
    return `${this.getBaseUrl()}/realms/${this.getRealm()}${path}`;
  }

  public getAdminUrl(path = "") {
    return `${this.getBaseUrl()}/admin/realms/${this.getRealm()}${path}`;
  }

  // Admin APIs
  public async getServiceAccountToken(): Promise<string> {
    const clientId =
      process.env.KEYCLOAK_SERVICE_CLIENT_ID ||
      process.env.KEYCLOAK_CLIENT_ID!;
    const clientSecret =
      process.env.KEYCLOAK_SERVICE_CLIENT_SECRET ||
      process.env.KEYCLOAK_CLIENT_SECRET!;

    if (!clientId || !clientSecret) {
      throw new Error(
        "Missing KEYCLOAK_SERVICE_CLIENT_ID / KEYCLOAK_SERVICE_CLIENT_SECRET"
      );
    }

    const response = await fetch(
      this.getAccountUrl("/protocol/openid-connect/token"),
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
      console.error(`[keycloak-admin] Failed to get service account token:`, err);
      throw new Error(`Failed to get service account token: ${err}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  public async getUserIdFromToken(accessToken: string): Promise<string> {
    const response = await fetch(
      this.getAccountUrl("/protocol/openid-connect/userinfo"),
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

  public async adminRequest(
    path: string,
    adminToken: string,
    options: RequestInit = {}
  ) {
    const url = this.getAdminUrl(path);

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

  private REQUIRED_ACTION_ALIAS_MAP: Record<string, string[]> = {
    CONFIGURE_TOTP: ["CONFIGURE_TOTP"],
    WEBAUTHN_REGISTER: ["WEBAUTHN_REGISTER", "webauthn-register"],
  };

  public getRequiredActionAliases(action: string) {
    return this.REQUIRED_ACTION_ALIAS_MAP[action] || [action];
  }

  public canonicalizeRequiredAction(action: string) {
    const normalized = action.toLowerCase();
    if (normalized === "configure_totp") return "CONFIGURE_TOTP";
    if (normalized === "webauthn-register") return "WEBAUTHN_REGISTER";
    return action;
  }

  public normalizeRequiredActions(requiredActions: string[] = []) {
    return Array.from(
      new Set(requiredActions.map((action) => this.canonicalizeRequiredAction(action)))
    );
  }

  public async appendUserRequiredAction(
    adminToken: string,
    userId: string,
    requiredActionAlias: string
  ) {
    const userResponse = await this.adminRequest(`/users/${userId}`, adminToken);
    if (!userResponse.ok) {
      throw new Error("Unable to load user data for required action update");
    }

    const userData = await userResponse.json();
    const targetCanonicalAction = this.canonicalizeRequiredAction(requiredActionAlias);
    const requiredActions = (userData.requiredActions || []).filter(
      (action: string) => this.canonicalizeRequiredAction(action) !== targetCanonicalAction
    );
    requiredActions.push(requiredActionAlias);

    const updateResponse = await this.adminRequest(`/users/${userId}`, adminToken, {
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

  public async removeUserRequiredAction(
    adminToken: string,
    userId: string,
    requiredActionAlias: string
  ) {
    const userResponse = await this.adminRequest(`/users/${userId}`, adminToken);
    if (!userResponse.ok) {
      throw new Error("Unable to load user data for required action update");
    }

    const userData = await userResponse.json();
    const targetCanonicalAction = this.canonicalizeRequiredAction(requiredActionAlias);
    const requiredActions = (userData.requiredActions || []).filter(
      (action: string) => this.canonicalizeRequiredAction(action) !== targetCanonicalAction
    );

    const updateResponse = await this.adminRequest(`/users/${userId}`, adminToken, {
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

  public async updateUserAttributes(
    adminToken: string,
    userId: string,
    attributes: Record<string, string[]>
  ) {
    const userResponse = await this.adminRequest(`/users/${userId}`, adminToken);
    if (!userResponse.ok) {
      throw new Error("Unable to load user data for attribute update");
    }

    const userData = await userResponse.json();
    const updateResponse = await this.adminRequest(`/users/${userId}`, adminToken, {
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

  public async resolveRequiredActionAlias(adminToken: string, candidates: string[]) {
    const response = await this.adminRequest("/authentication/required-actions", adminToken);
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
}

export const keycloak = KeycloakService.getInstance();
