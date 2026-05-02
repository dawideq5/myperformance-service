import type { AuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import { keycloak } from "@/lib/keycloak";
import { getRequiredEnv } from "@/lib/env";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { log } from "@/lib/logger";
// `enqueueProfilePropagation` celowo NIE jest tu importowany — patrz `events:` poniżej.

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
      async jwt({ token, account }) {
        // First login — store tokens
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

            // Imię i nazwisko z KC ID token — używane m.in. przez Chatwoot
            // widget HMAC verification + bell-icon greeting.
            const tp = payload as {
              given_name?: string;
              family_name?: string;
              name?: string;
              email?: string;
            };
            if (tp.given_name) session.user.firstName = tp.given_name;
            if (tp.family_name) session.user.lastName = tp.family_name;
            if (tp.name && !session.user.name) session.user.name = tp.name;
            if (tp.email && !session.user.email) session.user.email = tp.email;
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
    // ZMIANA 2026-05-01: NIE auto-propagujemy profilu na signIn. Tworzenie
    // konta w Documenso/Chatwoot/Moodle/Outline/Directus odbywa się TYLKO
    // gdy admin świadomie nadaje dostęp w `/admin/users/[id]`. Login do
    // dashboardu nie powinien implicite tworzyć membership w aplikacjach,
    // których user nigdy nie miał używać. Provisioning został przeniesiony
    // do explicit grant w Permissions panel.
    //
    // Re-enable: jeśli któryś provider potrzebuje sync profilu (np. zmiana
    // email/imienia) → podpiąć pod webhook w `app/api/users/[id]` PUT,
    // nie pod signIn.
    events: {},
    // Secure cookies: w produkcji ZAWSZE true. NextAuth z useSecureCookies=true
    // automatycznie:
    //   - dodaje __Secure- prefix do session-token, callback-url, pkce/state
    //   - dodaje __Host- do csrf-token
    //   - ustawia secure=true + sameSite=lax na wszystkich
    // Częściowy override `cookies:` był BUGGY — definiowaliśmy 3 cookies
    // (session/callback/csrf) ale NIE pkce/state/nonce. NextAuth nie merguje
    // z defaults — gdy podajesz `cookies`, używa tylko Twojej konfiguracji
    // dla wymienionych pól, a brakujące zostają undefined → OAuth flow
    // cookies (pkce, state) idą bez prefix nawet gdy useSecureCookies=true,
    // co prowadzi do mismatch po callback i logout cascade.
    useSecureCookies:
      process.env.NODE_ENV === "production" ||
      (process.env.NEXTAUTH_URL?.startsWith("https://") ?? false),
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
