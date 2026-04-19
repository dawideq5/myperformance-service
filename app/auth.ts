import type { AuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import { keycloak } from "@/lib/keycloak";
import { getRequiredEnv } from "@/lib/env";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";

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

/** Fetches user attributes from Keycloak Account API and caches them in the JWT token. */
async function hydrateTokenAttributes(token: any): Promise<void> {
  if (!token.accessToken) return;
  try {
    const res = await fetch(keycloak.getAccountUrl("/account"), {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const data = await res.json();
      token.userAttributes = data.attributes || {};
      token.emailVerified = data.emailVerified ?? false;
    }
  } catch {
    // Non-fatal — stale attributes will be used until next refresh
  }
}

let _authOptions: ReturnType<typeof buildAuthOptions> | null = null;

function buildAuthOptions() {
  const keycloakIssuer = keycloak.getIssuer();
  const keycloakClientId = getRequiredEnv("KEYCLOAK_CLIENT_ID");
  const keycloakClientSecret = getRequiredEnv("KEYCLOAK_CLIENT_SECRET");

  return {
    providers: [
      KeycloakProvider({
        clientId: keycloakClientId,
        clientSecret: keycloakClientSecret,
        issuer: keycloak.getPublicIssuer(),
        wellKnown: `${keycloak.getIssuer()}/.well-known/openid-configuration`,
        client: {
          token_endpoint_auth_method: "client_secret_post",
        },
        authorization: {
          params: {
            scope: "openid profile email",
          },
        },
      }),
    ],
    secret: process.env.NEXTAUTH_SECRET,
    session: {
      strategy: "jwt" as const,
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
    // Cookie name is left to NextAuth defaults. Overriding it here broke
    // middleware auth: withAuth reads `__Secure-next-auth.session-token` on
    // HTTPS, but an explicit name of `next-auth.session-token` caused a
    // write/read mismatch and an infinite login redirect loop.
    callbacks: {
      async jwt({ token, account, trigger }: any) {
        // First login — store tokens and fetch initial user attributes
        if (account) {
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
          token.idToken = account.id_token;
          token.sid = account.session_state;
          token.expiresAt =
            Math.floor(Date.now() / 1000) + (account.expires_in ?? 300);
          token.keycloakError = false;
          // Don't store userAttributes in JWT to reduce cookie size
          // token.userAttributes = {};
          // token.emailVerified = false;
          return token;
        }

        // Client called update() — re-fetch attributes with current token
        if (trigger === "update") {
          await hydrateTokenAttributes(token);
          return token;
        }

        // Token still valid — return cached
        const bufferSec = 60;
        if (
          token.expiresAt &&
          Date.now() / 1000 < token.expiresAt - bufferSec
        ) {
          return token;
        }

        // Token expired — refresh
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
            await hydrateTokenAttributes(token);
            return token;
          }
        }

        console.warn("[auth] Keycloak refresh failed — session invalidated");
        token.keycloakError = true;
        return token;
      },

      async session({ session, token }: any) {
        if (token.keycloakError) {
          session.error = "RefreshTokenExpired";
          return session;
        }

        session.accessToken = token.accessToken;
        session.idToken = token.idToken;
        session.error = token.error;

        // Extract roles from access token — no network call needed
        const rawToken: string = token.accessToken || token.idToken || "";
        if (rawToken) {
          try {
            const payload = keycloak.decodeTokenPayload(rawToken);
            const realmAccess = payload.realm_access || {};
            const resourceAccess = payload.resource_access || {};

            session.user.roles = [
              ...(realmAccess.roles || []),
              ...(resourceAccess[keycloakClientId]?.roles || []),
              ...(resourceAccess["realm-management"]?.roles || []),
            ];
          } catch {
            session.user.roles = [];
          }
        } else {
          session.user.roles = [];
        }

        session.user.sid = token.sid;
        session.user.id = token.sub;
        session.user.session_id = token.sid;

        return session;
      },

      async redirect({ url, baseUrl }: any) {
        if (url.startsWith("/")) {
          return `${baseUrl}${url}`;
        }

        try {
          const target = new URL(url);
          if (target.origin === baseUrl) {
            return target.toString();
          }
        } catch {
          return baseUrl;
        }

        return baseUrl;
      },
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    useSecureCookies: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
    debug: process.env.NODE_ENV === "development",
  };
}

export function getAuthOptions() {
  if (!_authOptions) {
    _authOptions = buildAuthOptions();
  }
  return _authOptions;
}

export const authOptions: AuthOptions = new Proxy({} as AuthOptions, {
  get(_target, prop) {
    return (getAuthOptions() as any)[prop];
  },
  has(_target, prop) {
    return prop in getAuthOptions();
  },
  ownKeys() {
    return Reflect.ownKeys(getAuthOptions());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const descriptor = Object.getOwnPropertyDescriptor(getAuthOptions(), prop);
    if (descriptor) {
      return { ...descriptor, configurable: true };
    }
    return descriptor;
  },
});

export default authOptions;
