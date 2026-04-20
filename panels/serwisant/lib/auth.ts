import type { AuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";

function optionalEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

export const REQUIRED_ROLE = "serwisant";
const PANEL_CLIENT_ID = "panel-serwisant";

function extractRoles(rawJwt: string): string[] {
  try {
    const payload = JSON.parse(Buffer.from(rawJwt.split(".")[1], "base64url").toString());
    const realmRoles: string[] = payload.realm_access?.roles ?? [];
    const clientRoles: string[] = payload.resource_access?.[PANEL_CLIENT_ID]?.roles ?? [];
    return [...realmRoles, ...clientRoles];
  } catch {
    return [];
  }
}

export const authOptions: AuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: optionalEnv("KEYCLOAK_CLIENT_ID"),
      clientSecret: optionalEnv("KEYCLOAK_CLIENT_SECRET"),
      issuer: optionalEnv("KEYCLOAK_ISSUER"),
      client: { token_endpoint_auth_method: "client_secret_post" },
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
        token.expiresAt = Math.floor(Date.now() / 1000) + ((account.expires_in as number | undefined) ?? 300);
        const raw = (account.access_token as string) || "";
        (token as { roles?: string[] }).roles = raw ? extractRoles(raw) : [];
      }
      return token;
    },
    async session({ session, token }) {
      const roles = ((token as { roles?: string[] }).roles) ?? [];
      (session as { accessToken?: unknown }).accessToken = token.accessToken;
      (session.user as { roles?: string[]; requiredRole?: string }).roles = roles;
      (session.user as { roles?: string[]; requiredRole?: string }).requiredRole = REQUIRED_ROLE;
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
  useSecureCookies: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
};
