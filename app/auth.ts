import type { AuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import KeycloakProvider from "next-auth/providers/keycloak";
import { keycloak } from "@/lib/keycloak";
import { getRequiredEnv } from "@/lib/env";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { log } from "@/lib/logger";
import { enqueueProfilePropagation } from "@/lib/permissions/sync";

const logger = log.child({ module: "auth" });

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

type RefreshFailure =
  | { kind: "transient" }
  | { kind: "invalid_grant"; reason: string };

// Single-flight: równoległe requesty z tym samym refresh tokenem zostaną
// scoalesce'd do jednego fetch'a do KC. Bez tego z `revokeRefreshToken=true`
// pierwszy request rotuje refresh token, drugi dostaje 400 invalid_grant
// i wywala usera z sesji.
const inflightRefresh = new Map<
  string,
  Promise<RefreshResult | RefreshFailure>
>();

async function refreshKeycloakToken(
  refreshToken: string,
  issuer: string,
  clientId: string,
  clientSecret: string,
): Promise<RefreshResult | RefreshFailure> {
  const cached = inflightRefresh.get(refreshToken);
  if (cached) return cached;
  const promise = doRefreshKeycloakToken(
    refreshToken,
    issuer,
    clientId,
    clientSecret,
  ).finally(() => {
    // Trzymamy mapping przez chwilę po rozwiązaniu, żeby pozostałe equal
    // requesty załapały się na ten sam result. setTimeout 1s wystarczy.
    setTimeout(() => inflightRefresh.delete(refreshToken), 1000).unref?.();
  });
  inflightRefresh.set(refreshToken, promise);
  return promise;
}

async function doRefreshKeycloakToken(
  refreshToken: string,
  issuer: string,
  clientId: string,
  clientSecret: string,
): Promise<RefreshResult | RefreshFailure> {
  try {
    const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      };
    }

    // 4xx from Keycloak = refresh token is permanently invalid (expired,
    // revoked, provider mismatch). 5xx = transient infra failure.
    const bodyText = await res.text();
    if (res.status >= 400 && res.status < 500) {
      let reason = "invalid_grant";
      try {
        const body = JSON.parse(bodyText);
        if (body?.error_description) reason = String(body.error_description);
        else if (body?.error) reason = String(body.error);
      } catch {
        /* non-JSON error body, keep default reason */
      }
      logger.warn("refresh rejected by Keycloak", { status: res.status, reason });
      return { kind: "invalid_grant", reason };
    }

    logger.error("token refresh transient failure", { status: res.status, body: bodyText });
    return { kind: "transient" };
  } catch (err) {
    logger.error("token refresh error", { err });
    return { kind: "transient" };
  }
}

function isRefreshSuccess(
  r: RefreshResult | RefreshFailure,
): r is RefreshResult {
  return (r as RefreshResult).accessToken !== undefined;
}

/** Fetches user attributes from Keycloak Account API and caches them in the JWT token. */
async function hydrateTokenAttributes(token: JWT): Promise<void> {
  if (!token.accessToken) return;
  try {
    const res = await fetch(keycloak.getAccountUrl("/account"), {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5_000),
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

let _authOptions: AuthOptions | null = null;

function buildAuthOptions(): AuthOptions {
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
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
    // Cookie name is left to NextAuth defaults. Overriding it here broke
    // middleware auth: withAuth reads `__Secure-next-auth.session-token` on
    // HTTPS, but an explicit name of `next-auth.session-token` caused a
    // write/read mismatch and an infinite login redirect loop.
    callbacks: {
      async jwt({ token, account, trigger }) {
        // First login — store tokens and fetch initial user attributes
        if (account) {
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
          token.sid = typeof account.session_state === "string"
            ? account.session_state
            : undefined;
          const expiresIn = typeof account.expires_in === "number"
            ? account.expires_in
            : 300;
          token.expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
          token.keycloakError = false;
          return token;
        }

        // Client called update() — re-fetch attributes with current token
        if (trigger === "update") {
          await hydrateTokenAttributes(token);
          return token;
        }

        // Token still valid — return cached. Buffer 5 min: refresh token
        // 5 min przed exp żeby parallel requesty po wygaśnięciu nie wpadały
        // w 401 cascade. Access token = 30 min, więc refresh trigger = 25 min.
        const bufferSec = 300;
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
            keycloakClientSecret,
          );

          if (isRefreshSuccess(refreshed)) {
            token.accessToken = refreshed.accessToken;
            token.refreshToken = refreshed.refreshToken;
            token.expiresAt = refreshed.expiresAt;
            token.keycloakError = false;
            await hydrateTokenAttributes(token);
            return token;
          }

          if (refreshed.kind === "invalid_grant") {
            // Hard-kill the session — refresh token is permanently unusable.
            // Clearing accessToken forces middleware to redirect to /login
            // instead of bouncing through broken refresh attempts.
            logger.warn("refresh token invalid — invalidating session", {
              reason: refreshed.reason,
            });
            token.accessToken = undefined;
            token.refreshToken = undefined;
            token.expiresAt = 0;
            token.keycloakError = true;
            return token;
          }

          // Transient: keep the existing (expired) token. The next request
          // will retry. Avoids kicking users out on a blip.
          logger.warn("transient refresh failure — will retry");
          return token;
        }

        token.keycloakError = true;
        return token;
      },

      async session({ session, token }) {
        if (token.keycloakError) {
          session.error = "RefreshTokenExpired";
          return session;
        }

        session.accessToken = token.accessToken;
        session.error = token.error;

        const rawToken = token.accessToken ?? "";
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
        session.user.id = typeof token.sub === "string" ? token.sub : undefined;
        session.user.session_id = token.sid;

        return session;
      },

      async redirect({ url, baseUrl }) {
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
    // Mirror Keycloak → downstream services on every successful login.
    // Fire-and-forget: profile propagation reaches 5+ providers (Chatwoot,
    // Directus, Moodle, Outline, Documenso DB, Postal DB) and would stall
    // the handshake if we awaited. Any failure is logged but never bubbles
    // back to the user — they still end up logged in; the next login will
    // retry the propagation.
    events: {
      async signIn({ user }) {
        const userId = (user as { id?: string } | undefined)?.id;
        if (!userId) return;
        // Kolejka z retry/backoff — jeśli któryś provider jest chwilowo down
        // (np. Chatwoot restart), job się retryuje zamiast cicho tracić sync.
        void enqueueProfilePropagation(userId, {
          actor: `signin:${user.email ?? userId}`,
        }).catch((err) => {
          logger.warn("enqueueProfilePropagation on signIn failed", {
            userId,
            err: err instanceof Error ? err.message : String(err),
          });
        });
      },
    },
    // Secure cookies: w produkcji ZAWSZE true — niezależnie od konfiguracji
    // NEXTAUTH_URL (która może być błędnie ustawiona). Dev: tylko gdy https.
    useSecureCookies:
      process.env.NODE_ENV === "production" ||
      (process.env.NEXTAUTH_URL?.startsWith("https://") ?? false),
    cookies: {
      // sameSite MUSI być "lax", nie "strict":
      //   - OAuth callback z auth.myperformance.pl wraca na myperformance.pl
      //     przez 302 redirect. Z sameSite=strict browser NIE wysyła session
      //     cookie przy cross-site top-level navigation, więc po loginie
      //     dashboard widzi unauthenticated user → redirect do login → loop.
      //   - sameSite=lax pozwala cookie przy top-level GET navigation
      //     (link/redirect), nadal blokuje cross-site POST/iframe (CSRF).
      //   - CSRF chroni middleware.ts przez Origin/Referer check na /api/account
      //     i /api/admin (defense-in-depth).
      sessionToken: {
        name:
          process.env.NODE_ENV === "production"
            ? "__Secure-next-auth.session-token"
            : "next-auth.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production",
        },
      },
      callbackUrl: {
        name:
          process.env.NODE_ENV === "production"
            ? "__Secure-next-auth.callback-url"
            : "next-auth.callback-url",
        options: {
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production",
        },
      },
      csrfToken: {
        name:
          process.env.NODE_ENV === "production"
            ? "__Host-next-auth.csrf-token"
            : "next-auth.csrf-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production",
        },
      },
    },
    debug: process.env.NODE_ENV === "development",
  };
}

export function getAuthOptions(): AuthOptions {
  if (!_authOptions) {
    _authOptions = buildAuthOptions();
  }
  return _authOptions;
}

export const authOptions: AuthOptions = new Proxy({} as AuthOptions, {
  get(_target, prop) {
    return (getAuthOptions() as unknown as Record<PropertyKey, unknown>)[prop];
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
