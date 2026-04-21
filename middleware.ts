import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { DEFAULT_KEYCLOAK_REALM } from "@/lib/keycloak-constants";
import { trimSlash } from "@/lib/utils";
import { MIDDLEWARE_USERINFO_CACHE_TTL_MS } from "@/lib/constants";

export const runtime = "nodejs";

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

function getExpectedHost(req: Request): string | null {
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) return forwardedHost.split(",")[0].trim();
  const host = req.headers.get("host");
  if (host) return host;
  try {
    return new URL(req.url).host;
  } catch {
    return null;
  }
}

function extractHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function isSameOrigin(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const expectedHost = getExpectedHost(req);
  if (!expectedHost) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    const originHost = extractHost(origin);
    return originHost === expectedHost;
  }

  const referer = req.headers.get("referer");
  if (!referer) return false;
  const refererHost = extractHost(referer);
  return refererHost === expectedHost;
}

interface TokenPayload {
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}

function decodePayload(jwt: string): TokenPayload | null {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

function collectRoles(accessToken: string): string[] {
  const payload = decodePayload(accessToken);
  if (!payload) return [];
  const realm = payload.realm_access?.roles ?? [];
  const resource = payload.resource_access ?? {};
  const all: string[] = [...realm];
  for (const v of Object.values(resource)) {
    if (Array.isArray(v?.roles)) all.push(...v.roles);
  }
  return all;
}

const SUPERADMIN_ROLES = new Set(["realm-admin", "manage-realm", "admin"]);

/**
 * Defense-in-depth route guards enforced at the edge. Server-side `page.tsx`
 * also re-checks these via admin-auth helpers so that even if a session
 * bypasses the middleware (e.g., during SSR prefetch from cached HTML), the
 * page returns a redirect to /forbidden.
 *
 * Paths are matched with `startsWith` so nested routes inherit the guard.
 */
const ROLE_GUARDS: Array<{ path: string; anyOf: string[] }> = [
  { path: "/admin/users", anyOf: ["manage_users"] },
  { path: "/admin/certificates", anyOf: ["certificates_admin"] },
  { path: "/api/admin/users", anyOf: ["manage_users"] },
  { path: "/api/admin/certificates", anyOf: ["certificates_admin"] },
  { path: "/dashboard/moje-dokumenty", anyOf: ["documents_user"] },
];

function findMatchingGuard(pathname: string) {
  return ROLE_GUARDS.find((g) => pathname === g.path || pathname.startsWith(`${g.path}/`));
}

function hasAny(roles: string[], wanted: string[]): boolean {
  if (roles.some((r) => SUPERADMIN_ROLES.has(r))) return true;
  return wanted.some((r) => roles.includes(r));
}

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    if (
      (pathname.startsWith("/api/account") ||
        pathname.startsWith("/api/admin")) &&
      !isSameOrigin(req)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isProtected =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/account") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api/account") ||
      pathname.startsWith("/api/admin");

    if (!isProtected) return NextResponse.next();

    const isApi = pathname.startsWith("/api/");

    if (!token || !token.accessToken) {
      if (isApi) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (token.keycloakError) {
      if (isApi) {
        return NextResponse.json({ error: "SessionExpired" }, { status: 401 });
      }
      return NextResponse.redirect(
        new URL("/login?error=SessionExpired", req.url)
      );
    }

    const accessToken = token.accessToken as string;

    // Role-based guard — evaluated BEFORE userinfo network call for speed.
    const guard = findMatchingGuard(pathname);
    if (guard) {
      const roles = collectRoles(accessToken);
      if (!hasAny(roles, guard.anyOf)) {
        if (isApi) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/forbidden", req.url));
      }
    }

    const cacheKey = tokenCacheKey(accessToken);
    const now = Date.now();
    const cached = userinfoCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      if (!cached.valid) {
        if (isApi) {
          return NextResponse.json({ error: "SessionExpired" }, { status: 401 });
        }
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
        if (isApi) {
          return NextResponse.json({ error: "SessionExpired" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/api/auth/logout", req.url));
      }
    } catch (e) {
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
  matcher: [
    "/dashboard/:path*",
    "/account/:path*",
    "/admin/:path*",
    "/api/account/:path*",
    "/api/admin/:path*",
  ],
};
