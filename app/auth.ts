import KeycloakProvider from "next-auth/providers/keycloak";

console.log("=== AUTH CONFIG ===");
console.log("KEYCLOAK_ISSUER:", process.env.KEYCLOAK_ISSUER);
console.log("KEYCLOAK_URL:", process.env.KEYCLOAK_URL);
console.log("KEYCLOAK_CLIENT_ID:", process.env.KEYCLOAK_CLIENT_ID);
console.log("NEXTAUTH_URL:", process.env.NEXTAUTH_URL);
console.log("NEXTAUTH_SECRET:", process.env.NEXTAUTH_SECRET ? "SET" : "NOT SET");
console.log("==================");

export const authOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER || process.env.KEYCLOAK_URL!,
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

export default authOptions;
