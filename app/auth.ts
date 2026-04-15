import KeycloakProvider from "next-auth/providers/keycloak";

const KEYCLOAK_URL =
  process.env.KEYCLOAK_URL || "https://auth.myperformance.pl";
const keycloakIssuer = `${KEYCLOAK_URL}/realms/MyPerformance`;

async function refreshKeycloakToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
} | null> {
  try {
    const res = await fetch(
      `${keycloakIssuer}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
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

export const authOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: keycloakIssuer,
    }),
  ],
  events: {
    async signOut({ token }: any) {
      if (token?.idToken) {
        const redirectUri = encodeURIComponent(
          process.env.NEXTAUTH_URL || "http://localhost:3000"
        );
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
        const refreshed = await refreshKeycloakToken(token.refreshToken);
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
            ...(resourceAccess[process.env.KEYCLOAK_CLIENT_ID!]?.roles || []),
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
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  debug: process.env.NODE_ENV === "development",
};

export default authOptions;
