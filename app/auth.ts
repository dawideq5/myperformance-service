import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_URL!,
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.idToken = token.idToken as string;
      
      // Extract roles from Keycloak token
      if (token.idToken) {
        const idToken = token.idToken as string;
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        const realmAccess = payload.realm_access || {};
        const resourceAccess = payload.resource_access || {};
        
        // Get roles from realm_access and resource_access
        const roles = [
          ...(realmAccess.roles || []),
          ...(resourceAccess[process.env.KEYCLOAK_CLIENT_ID!]?.roles || [])
        ];
        
        session.user.roles = roles;
      }
      
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
