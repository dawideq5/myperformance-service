import KeycloakProvider from "next-auth/providers/keycloak";
import { getAccountUrl, getKeycloakIssuer } from "@/lib/keycloak-config";

const keycloakIssuer = process.env.KEYCLOAK_ISSUER || (process.env.KEYCLOAK_URL ? getKeycloakIssuer() : undefined);

async function refreshAccessToken(token: any) {
  try {
    if (!token.refreshToken) {
      return { ...token, error: "MissingRefreshToken" };
    }

    const response = await fetch(getAccountUrl("/protocol/openid-connect/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        refresh_token: token.refreshToken,
      }),
    });

    if (!response.ok) {
      return { ...token, error: "RefreshAccessTokenError" };
    }

    const refreshedTokens = await response.json();
    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      idToken: refreshedTokens.id_token ?? token.idToken,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: keycloakIssuer!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, account }: any) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = Date.now() + (account.expires_in || 0) * 1000;
        token.error = undefined;
      }

      if (token.accessTokenExpires && Date.now() >= token.accessTokenExpires) {
        return refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken;
      session.idToken = token.idToken;
      session.error = token.error;

      // Extract roles from Keycloak token
      if (token.idToken) {
        try {
          const idToken = token.idToken;
          const base64Payload = idToken.split('.')[1];
          const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf-8'));
          const realmAccess = payload.realm_access || {};
          const resourceAccess = payload.resource_access || {};

          // Get roles from realm_access and resource_access
          const roles = [
            ...(realmAccess.roles || []),
            ...(resourceAccess[process.env.KEYCLOAK_CLIENT_ID!]?.roles || [])
          ];

          session.user.roles = roles;
        } catch (error) {
          console.error('Failed to parse Keycloak token:', error);
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
  debug: process.env.NODE_ENV === 'development',
};

export default authOptions;
