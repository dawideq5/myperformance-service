import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const trimSlash = (value: string) => value.replace(/\/+$/, "");
const DEFAULT_KEYCLOAK_REALM = "MyPerformance";

const getIssuerForMiddleware = () => {
  const explicitIssuer = process.env.KEYCLOAK_ISSUER?.trim();
  if (explicitIssuer) return trimSlash(explicitIssuer);

  const keycloakUrl = process.env.KEYCLOAK_URL?.trim();
  const realm = process.env.KEYCLOAK_REALM?.trim() || DEFAULT_KEYCLOAK_REALM;
  if (!keycloakUrl) return null;

  return `${trimSlash(keycloakUrl)}/realms/${realm}`;
};

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token;

    // We protect specific paths
    const pathname = req.nextUrl.pathname;
    const isProtected = pathname.startsWith("/dashboard") || pathname.startsWith("/account") || pathname.startsWith("/api/account");

    if (isProtected) {
      if (!token || !token.accessToken) {
        return NextResponse.redirect(new URL("/login", req.url));
      }

      // Check if token was marked with keycloakError in jwt callback
      if (token.keycloakError) {
        return NextResponse.redirect(new URL("/login?error=SessionExpired", req.url));
      }

      // STRICT VALIDATION IN MIDDLEWARE: Ping Keycloak userinfo
      // This is safe since it runs on navigation/API request, verifying true state
      try {
        const issuer = getIssuerForMiddleware();
        if (issuer) {
          const userInfoResponse = await fetch(
            `${issuer}/protocol/openid-connect/userinfo`,
            {
              headers: { Authorization: `Bearer ${token.accessToken}` },
            }
          );
          if (!userInfoResponse.ok) {
            console.warn("[middleware] Keycloak session invalid (userinfo failed)");
            return NextResponse.redirect(new URL("/api/auth/logout", req.url));
          }
        }
      } catch (e) {
        console.error("[middleware] Keycloak userinfo check failed", e);
        // Do not block on network failure if Keycloak is temporarily down, unless desired
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        return true;
      },
    },
    pages: {
      signIn: "/login",
    }
  }
);

export const config = {
  // We want to run middleware on our protected app routes
  matcher: ["/dashboard/:path*", "/account/:path*", "/api/account/:path*"],
};
