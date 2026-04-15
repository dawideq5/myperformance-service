import KeycloakProvider from "next-auth/providers/keycloak";
import { getKeycloakIssuer } from "@/lib/keycloak-config";
import { getCanonicalLoginUrl, normalizeAuthRedirect } from "@/lib/app-url";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

async function refreshKeycloakToken(
  refreshToken: string,
  issuer: string,
  clientId: string,
  clientSecret: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
} | null> {
  try {
    const res = await fetch(
      `${issuer}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      }
    );

    if (!res.ok) {
      console.error("[auth] Token refresh failed:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      idToken: data.id_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  } catch (err) {
    console.error("[auth] Token refresh error:", err);
    return null;
  }
}

let _authOptions: ReturnType<typeof buildAuthOptions> | null = null;

function buildAuthOptions() {
  const keycloakIssuer = getKeycloakIssuer();
  const keycloakClientId = getRequiredEnv("KEYCLOAK_CLIENT_ID");
  const keycloakClientSecret = getRequiredEnv("KEYCLOAK_CLIENT_SECRET");

  return {
    providers: [
      KeycloakProvider({
        clientId: keycloakClientId,
        clientSecret: keycloakClientSecret,
        issuer: keycloakIssuer,
        client: {
          token_endpoint_auth_method: "client_secret_post",
        },
      }),
    ],
    events: {
      async signOut({ token }: any) {
        if (token?.idToken) {
          const redirectUri = encodeURIComponent(getCanonicalLoginUrl());
          const logoutUrl = `${keycloakIssuer}/protocol/openid-connect/logout?id_token_hint=${token.idToken}&post_logout_redirect_uri=${redirectUri}`;
          try {
            await fetch(logoutUrl, { method: "GET" });
          } catch (err) {
            console.error("[auth] Keycloak logout failed:", err);
          }
        }
      },
    },
    secret: process.env.NEXTAUTH_SECRET,
    session: {
      strategy: "jwt" as const,
      maxAge: 8 * 60 * 60, // 8 hours – tighter than Keycloak session
    },
    callbacks: {
      async jwt({ token, account }: any) {
        // First login — store tokens
        if (account) {
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
          token.idToken = account.id_token;
          token.expiresAt =
            Math.floor(Date.now() / 1000) + (account.expires_in ?? 300);
          token.keycloakError = false;
          return token;
        }

        // Token still valid
        const bufferSec = 30;
        if (
          token.expiresAt &&
          Date.now() / 1000 < token.expiresAt - bufferSec
        ) {
          return token;
        }

        // Token expired — try refresh
        if (token.refreshToken) {
          const refreshed = await refreshKeycloakToken(
            token.refreshToken,
            keycloakIssuer,
            keycloakClientId,
            keycloakClientSecret
          );
          if (refreshed) {
            token.accessToken = refreshed.accessToken;
            token.refreshToken = refreshed.refreshToken;
            token.idToken = refreshed.idToken;
            token.expiresAt = refreshed.expiresAt;
            token.keycloakError = false;
            return token;
          }
        }

        // Refresh failed — mark session as invalid
        console.warn("[auth] Keycloak refresh failed — session invalidated");
        token.keycloakError = true;
        return token;
      },

      async session({ session, token }: any) {
        // Propagate error so client can force logout
        if (token.keycloakError) {
          session.error = "RefreshTokenExpired";
          return session;
        }

        session.accessToken = token.accessToken;
        session.idToken = token.idToken;
        session.error = token.error;

        // Extract roles from access token (more up-to-date than idToken)
        const rawToken: string = token.accessToken || token.idToken || "";
        if (rawToken) {
          try {
            const base64Payload = rawToken.split(".")[1];
            const payload = JSON.parse(
              Buffer.from(base64Payload, "base64").toString("utf-8")
            );
            const realmAccess = payload.realm_access || {};
            const resourceAccess = payload.resource_access || {};

            const roles = [
              ...(realmAccess.roles || []),
              ...(resourceAccess[keycloakClientId]?.roles || []),
              ...(resourceAccess["realm-management"]?.roles || []),
            ];

            session.user.roles = roles;
          } catch (error) {
            console.error("[auth] Failed to parse Keycloak token:", error);
            session.user.roles = [];
          }
        }

        return session;
      },
      async redirect({ url, baseUrl }: any) {
        return normalizeAuthRedirect(url, baseUrl);
      },
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    debug: process.env.NODE_ENV === "development",
  };
}

export function getAuthOptions() {
  if (!_authOptions) {
    _authOptions = buildAuthOptions();
  }
  return _authOptions;
}

export const authOptions = new Proxy({} as any, {
  get(_target, prop) {
    return (getAuthOptions() as any)[prop];
  },
});

export default authOptions;
