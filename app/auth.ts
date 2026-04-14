import NextAuth from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";

export const authOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_URL!,
      wellKnown: `${process.env.KEYCLOAK_URL!}/.well-known/openid-configuration`,
      authorization: {
        url: `${process.env.KEYCLOAK_URL!}/protocol/openid-connect/auth`,
        params: { scope: "openid email profile" },
      },
      token: {
        url: `${process.env.KEYCLOAK_URL!}/protocol/openid-connect/token`,
      },
      userinfo: {
        url: `${process.env.KEYCLOAK_URL!}/protocol/openid-connect/userinfo`,
      },
      idToken: true,
      checks: ["pkce", "state"],
    }),
  ],
  callbacks: {
    async jwt({ token, account }: any) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken;
      session.idToken = token.idToken;

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
  events: {
    async signIn({ user, account, profile, isNewUser }: any) {
      console.log('Keycloak signIn event:', { user, account, profile, isNewUser });
    },
    async signOut({ token }: any) {
      console.log('Keycloak signOut event:', { token });
    },
  },
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);
export default handler;
