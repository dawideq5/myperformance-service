import { createHash, randomUUID } from "crypto";
import { DEFAULT_KEYCLOAK_REALM } from "@/lib/keycloak-constants";
import { trimSlash } from "@/lib/utils";

export class KeycloakService {
  private static instance: KeycloakService;

  private constructor() {}

  public static getInstance(): KeycloakService {
    if (!KeycloakService.instance) {
      KeycloakService.instance = new KeycloakService();
    }
    return KeycloakService.instance;
  }

  public getConfiguredIssuer() {
    const issuer = process.env.KEYCLOAK_ISSUER?.trim();
    return issuer ? trimSlash(issuer) : "";
  }

  public getRealm() {
    const explicitRealm = process.env.KEYCLOAK_REALM?.trim();
    if (explicitRealm) return explicitRealm;

    const issuer = this.getConfiguredIssuer();
    if (issuer) {
      const match = issuer.match(/\/realms\/([^/]+)$/i);
      if (match?.[1]) return match[1];
    }

    return DEFAULT_KEYCLOAK_REALM;
  }

  public getBaseUrl() {
    const keycloakUrl = process.env.KEYCLOAK_URL?.trim();
    if (keycloakUrl) {
      return trimSlash(keycloakUrl);
    }

    const issuer = this.getConfiguredIssuer();
    if (issuer) {
      const match = issuer.match(/^(https?:\/\/.+?)\/realms\/[^/]+$/i);
      if (match?.[1]) return trimSlash(match[1]);
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
    if (issuer) return trimSlash(issuer);

    const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL?.trim();
    if (!keycloakUrl) {
      return `http://localhost:8080/realms/${DEFAULT_KEYCLOAK_REALM}`;
    }

    return `${trimSlash(keycloakUrl)}/realms/${DEFAULT_KEYCLOAK_REALM}`;
  }

  public getAccountUrl(path = "") {
    return `${this.getBaseUrl()}/realms/${this.getRealm()}${path}`;
  }

  public getAdminUrl(path = "") {
    return `${this.getBaseUrl()}/admin/realms/${this.getRealm()}${path}`;
  }

  public getAdminConsoleUrl() {
    const adminRealm = process.env.KEYCLOAK_ADMIN_REALM?.trim() || "master";
    return `${this.getBaseUrl()}/admin/${adminRealm}/console/`;
  }

  public decodeTokenPayload(token: string) {
    const [, payload] = token.split(".");

    if (!payload) {
      throw new Error("Invalid JWT payload");
    }

    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  }

  public getBrokerLinkUrl(
    provider: string,
    accessToken: string,
    redirectUri: string,
    clientId?: string
  ) {
    const payload = this.decodeTokenPayload(accessToken);
    const issuedFor = clientId || payload.azp || payload.client_id;
    const sessionState = payload.session_state || payload.sid;

    if (!issuedFor) {
      throw new Error("Missing Keycloak client id in token payload");
    }

    if (!sessionState) {
      throw new Error("Missing Keycloak session state in token payload");
    }

    const nonce = randomUUID();
    const hash = createHash("sha256")
      .update(`${nonce}${sessionState}${issuedFor}${provider}`, "utf-8")
      .digest("base64url");

    const linkUrl = new URL(`${this.getPublicIssuer()}/broker/${provider}/link`);
    linkUrl.searchParams.set("client_id", issuedFor);
    linkUrl.searchParams.set("redirect_uri", redirectUri);
    linkUrl.searchParams.set("nonce", nonce);
    linkUrl.searchParams.set("hash", hash);

    return {
      url: linkUrl.toString(),
      nonce,
      hash,
      sessionState,
      clientId: issuedFor,
    };
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
    WEBAUTHN_REGISTER: [
      "WEBAUTHN_REGISTER",
      "webauthn-register",
      "webauthn-register-passwordless",
    ],
    VERIFY_EMAIL: ["VERIFY_EMAIL", "verify-email"],
  };

  public getRequiredActionAliases(action: string) {
    return this.REQUIRED_ACTION_ALIAS_MAP[action] || [action];
  }

  public canonicalizeRequiredAction(action: string) {
    const normalized = action.toLowerCase();
    if (normalized === "configure_totp") return "CONFIGURE_TOTP";
    if (normalized === "webauthn-register") return "WEBAUTHN_REGISTER";
    if (normalized === "webauthn-register-passwordless") {
      return "WEBAUTHN_REGISTER";
    }
    if (normalized === "verify-email") return "VERIFY_EMAIL";
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
    const updateBody = {
      ...userData,
      attributes: {
        ...(userData.attributes || {}),
        ...attributes,
      },
    };

    const updateResponse = await this.adminRequest(`/users/${userId}`, adminToken, {
      method: "PUT",
      body: JSON.stringify(updateBody),
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

  /**
   * Triggers Keycloak to immediately send an action email to the user
   * (verify email, update password, etc.). Unlike adding a required action
   * to the user record, this sends the email right away.
   */
  public async executeActionsEmail(
    adminToken: string,
    userId: string,
    actions: string[],
    options: { lifespan?: number; clientId?: string; redirectUri?: string } = {}
  ) {
    const params = new URLSearchParams();
    if (options.lifespan) params.set("lifespan", String(options.lifespan));
    if (options.clientId) params.set("client_id", options.clientId);
    if (options.redirectUri) params.set("redirect_uri", options.redirectUri);

    const query = params.toString();
    const path = `/users/${userId}/execute-actions-email${query ? `?${query}` : ""}`;

    const response = await this.adminRequest(path, adminToken, {
      method: "PUT",
      body: JSON.stringify(actions),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || "Unable to trigger execute-actions-email");
    }
  }

  /**
   * Sets emailVerified flag on a user record via Admin API.
   * Also removes VERIFY_EMAIL from required actions if present when verified=true.
   */
  public async setEmailVerified(
    adminToken: string,
    userId: string,
    verified: boolean
  ) {
    const userResponse = await this.adminRequest(`/users/${userId}`, adminToken);
    if (!userResponse.ok) {
      throw new Error("Unable to load user data for email verification update");
    }

    const userData = await userResponse.json();
    const requiredActions = verified
      ? (userData.requiredActions || []).filter(
          (action: string) =>
            this.canonicalizeRequiredAction(action) !== "VERIFY_EMAIL"
        )
      : userData.requiredActions;

    const updateResponse = await this.adminRequest(`/users/${userId}`, adminToken, {
      method: "PUT",
      body: JSON.stringify({
        ...userData,
        emailVerified: verified,
        requiredActions,
      }),
    });

    if (!updateResponse.ok) {
      const details = await updateResponse.text();
      throw new Error(details || "Unable to update emailVerified flag");
    }
  }

  public async getBruteForceStatus(adminToken: string, userId: string) {
    const response = await this.adminRequest(
      `/attack-detection/brute-force/users/${userId}`,
      adminToken,
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error("Unable to read brute-force status");
    }
    return (await response.json()) as {
      numFailures?: number;
      disabled?: boolean;
      lastFailure?: number;
      lastIPFailure?: string;
    };
  }

  public async clearBruteForce(adminToken: string, userId: string) {
    const response = await this.adminRequest(
      `/attack-detection/brute-force/users/${userId}`,
      adminToken,
      { method: "DELETE" },
    );
    if (!response.ok && response.status !== 404) {
      const details = await response.text();
      throw new Error(details || "Unable to clear brute-force lockout");
    }
  }

  /**
   * Removes a federated identity (e.g., Google) from a user.
   */
  public async removeFederatedIdentity(
    adminToken: string,
    userId: string,
    provider: string
  ) {
    const response = await this.adminRequest(
      `/users/${userId}/federated-identity/${provider}`,
      adminToken,
      { method: "DELETE" }
    );

    if (!response.ok && response.status !== 404) {
      const details = await response.text();
      throw new Error(details || `Unable to remove federated identity ${provider}`);
    }
  }

  /**
   * Retrieves tokens stored by Keycloak for an external IdP (broker token endpoint).
   * Requires `storeToken=true` and `addReadTokenRoleOnCreate=true` on the IdP,
   * plus the user must have `broker/read-token` role (auto-granted on IdP first login).
   */
  public async getBrokerTokens(
    userAccessToken: string,
    provider: string
  ): Promise<Record<string, any>> {
    const url = this.getAccountUrl(`/broker/${provider}/token`);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Failed to retrieve broker tokens for ${provider}: ${response.status} ${details}`
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    return Object.fromEntries(new URLSearchParams(text));
  }

  /**
   * Fetches Google user info using a Google access token.
   */
  public async getGoogleUserInfo(
    googleAccessToken: string
  ): Promise<{
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
    picture?: string;
  }> {
    const response = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      }
    );

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Failed to fetch Google userinfo: ${response.status} ${details}`
      );
    }

    return response.json();
  }
}

export const keycloak = KeycloakService.getInstance();
