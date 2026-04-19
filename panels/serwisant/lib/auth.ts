import type { AuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const REQUIRED_ROLE = "serwisant";
const PANEL_CLIENT_ID = "panel-serwisant";

export const authOptions: AuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: requiredEnv("KEYCLOAK_CLIENT_ID"),
      clientSecret: requiredEnv("KEYCLOAK_CLIENT_SECRET"),
      issuer: requiredEnv("KEYCLOAK_ISSUER"),
      authorization: { params: { scope: "openid profile email" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        token.expiresAt = Math.floor(Date.now() / 1000) + ((account.expires_in as number | undefined) ?? 300);
      }
      return token;
    },
    async session({ session, token }) {
      const raw = (token.accessToken as string) || (token.idToken as string) || "";
      let roles: string[] = [];
      if (raw) {
        try {
          const payload = JSON.parse(Buffer.from(raw.split(".")[1], "base64url").toString());
          const realmRoles = payload.realm_access?.roles ?? [];
          const clientRoles = payload.resource_access?.[PANEL_CLIENT_ID]?.roles ?? [];
          roles = [...realmRoles, ...clientRoles];
        } catch {
          roles = [];
        }
      }
      (session as any).accessToken = token.accessToken;
      (session.user as any).roles = roles;
      (session.user as any).requiredRole = REQUIRED_ROLE;
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
  useSecureCookies: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
};
