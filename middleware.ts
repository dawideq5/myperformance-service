import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { DEFAULT_KEYCLOAK_REALM } from "@/lib/keycloak-constants";
import { trimSlash } from "@/lib/utils";
import { MIDDLEWARE_USERINFO_CACHE_TTL_MS } from "@/lib/constants";

// In-memory cache: token hash → { valid, expiresAt }
// Avoids a Keycloak userinfo round-trip on every single request.
const userinfoCache = new Map<string, { valid: boolean; expiresAt: number }>();

function tokenCacheKey(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
}

function getIssuerForMiddleware(): string | null {
  const explicitIssuer = process.env.KEYCLOAK_ISSUER?.trim();
  if (explicitIssuer) return trimSlash(explicitIssuer);

  const keycloakUrl = process.env.KEYCLOAK_URL?.trim();
  const realm = process.env.KEYCLOAK_REALM?.trim() || DEFAULT_KEYCLOAK_REALM;
  if (!keycloakUrl) return null;

  return `${trimSlash(keycloakUrl)}/realms/${realm}`;
}

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    const isProtected =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/account") ||
      pathname.startsWith("/api/account");

    if (!isProtected) return NextResponse.next();

    if (!token || !token.accessToken) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (token.keycloakError) {
      return NextResponse.redirect(
        new URL("/login?error=SessionExpired", req.url)
      );
    }

    const accessToken = token.accessToken as string;
    const cacheKey = tokenCacheKey(accessToken);
    const now = Date.now();
    const cached = userinfoCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      if (!cached.valid) {
        return NextResponse.redirect(new URL("/api/auth/logout", req.url));
      }
      return NextResponse.next();
    }

    try {
      const issuer = getIssuerForMiddleware();
      if (!issuer) {
        console.warn("[middleware] Missing Keycloak issuer configuration");
        return NextResponse.redirect(
          new URL("/login?error=Configuration", req.url)
        );
      }

      const userInfoResponse = await fetch(
        `${issuer}/protocol/openid-connect/userinfo`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const valid = userInfoResponse.ok;
      userinfoCache.set(cacheKey, {
        valid,
        expiresAt: now + MIDDLEWARE_USERINFO_CACHE_TTL_MS,
      });

      if (!valid) {
        console.warn("[middleware] Keycloak session invalid (userinfo failed)");
        return NextResponse.redirect(new URL("/api/auth/logout", req.url));
      }
    } catch (e) {
      // Do not block on network failure — Keycloak may be temporarily unreachable
      console.error("[middleware] Keycloak userinfo check failed", e);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: () => true,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*", "/api/account/:path*"],
};
