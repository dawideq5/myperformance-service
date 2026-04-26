import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { DEFAULT_KEYCLOAK_REALM } from "@/lib/keycloak-constants";
import { trimSlash } from "@/lib/utils";
import { MIDDLEWARE_USERINFO_CACHE_TTL_MS } from "@/lib/constants";
import { log } from "@/lib/logger";
import { getArea, listAreaKcRoleNames } from "@/lib/permissions/areas";

const REQUEST_ID_HEADER = "x-request-id";

function ensureRequestId(req: Request): string {
  const incoming = req.headers.get(REQUEST_ID_HEADER)?.trim();
  if (incoming && /^[a-zA-Z0-9-]{8,128}$/.test(incoming)) return incoming;
  return randomUUID();
}

function withRequestIdHeaders(res: NextResponse, requestId: string): NextResponse {
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

export const runtime = "nodejs";

const logger = log.child({ module: "middleware" });

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
  sub?: string;
  email?: string;
  preferred_username?: string;
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
 * Defense-in-depth route guards enforced at the edge. Role lists są generowane
 * z `lib/permissions/areas` — dodanie nowej roli do area automatycznie
 * poszerza guard bez edycji middleware'a.
 */
function areaRoles(
  areaId: string,
  filter?: (name: string) => boolean,
): string[] {
  const area = getArea(areaId);
  if (!area) return [];
  const names = listAreaKcRoleNames(area);
  return filter ? names.filter(filter) : names;
}

interface RoleGuard {
  path: string;
  anyOf: string[];
  /** Dodatkowe dopasowanie — jeśli user ma rolę pasującą do prefixu
   * (np. `moodle_` dla dynamicznych ról Moodle), guard przepuszcza. */
  anyPrefix?: string[];
}

const ROLE_GUARDS: RoleGuard[] = [
  { path: "/admin/users", anyOf: areaRoles("keycloak") },
  { path: "/admin/certificates", anyOf: areaRoles("certificates") },
  { path: "/api/admin/users", anyOf: areaRoles("keycloak") },
  { path: "/api/admin/certificates", anyOf: areaRoles("certificates") },
  { path: "/dashboard/step-ca", anyOf: areaRoles("stepca") },
  {
    path: "/dashboard/documents-handler",
    anyOf: areaRoles("documenso", (n) => n !== "documenso_member"),
  },
  // Moodle — dowolna rola z obszaru (seed + dynamic jak moodle_editingteacher,
  // moodle_teacher z `core_role_get_roles`) daje dostęp do integration API.
  { path: "/api/integrations/moodle", anyOf: [], anyPrefix: ["moodle_"] },
];

function findMatchingGuard(pathname: string) {
  return ROLE_GUARDS.find((g) => pathname === g.path || pathname.startsWith(`${g.path}/`));
}

function hasAny(roles: string[], wanted: string[], anyPrefix?: string[]): boolean {
  if (roles.some((r) => SUPERADMIN_ROLES.has(r))) return true;
  if (wanted.some((r) => roles.includes(r))) return true;
  if (anyPrefix && anyPrefix.length > 0) {
    return roles.some((r) => anyPrefix.some((p) => r.startsWith(p)));
  }
  return false;
}

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const requestId = ensureRequestId(req);

    if (
      (pathname.startsWith("/api/account") ||
        pathname.startsWith("/api/admin")) &&
      !isSameOrigin(req)
    ) {
      return withRequestIdHeaders(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        requestId,
      );
    }

    const isProtected =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/account") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api/account") ||
      pathname.startsWith("/api/admin");

    // Closure'em zmienna deviceCookieToSet ustawiana niżej — pasuje do
    // każdego responses przez withDeviceCookie helper (poniżej).
    let _deviceCookie: string | null = null;
    const setDeviceCookieValue = (v: string) => {
      _deviceCookie = v;
    };

    const passThrough = () => {
      const res = NextResponse.next({
        request: { headers: new Headers(req.headers) },
      });
      res.headers.set(REQUEST_ID_HEADER, requestId);
      if (_deviceCookie) res.headers.append("Set-Cookie", _deviceCookie);
      return res;
    };

    // Propagate X-Request-Id inbound to downstream handlers and back to client.
    (req.headers as Headers).set(REQUEST_ID_HEADER, requestId);

    const isApi = pathname.startsWith("/api/");

    // ── Device fingerprinting ─────────────────────────────────────────────
    // Każdy request od auth'd usera dostaje cookie `mp_did` (HMAC-signed
    // UUID, .myperformance.pl, 1y). recordSighting deduped na 5min per
    // (device, user, path-prefix) — ogranicza zapis do DB.
    let deviceId: string | null = null;
    try {
      const { parseDeviceCookie, newDeviceId, buildDeviceCookie, recordSighting, DEVICE_COOKIE_NAME } =
        await import("@/lib/security/devices");
      const existing = req.cookies.get(DEVICE_COOKIE_NAME)?.value;
      const parsed = parseDeviceCookie(existing);
      if (parsed) {
        deviceId = parsed;
      } else {
        deviceId = newDeviceId();
        setDeviceCookieValue(buildDeviceCookie(deviceId));
      }
      // Sighting tylko gdy mamy token (auth'd user) — anon nie loguje
      if (token?.accessToken && deviceId) {
        const accessTok = token.accessToken as string;
        const payload = decodePayload(accessTok);
        const userId = payload?.sub ?? null;
        const userEmail = (payload?.email as string | undefined) ?? null;
        const ip =
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          req.headers.get("x-real-ip") ??
          null;
        const ua = req.headers.get("user-agent");
        // fire-and-forget
        void recordSighting({
          deviceId,
          userId,
          userEmail,
          ip,
          userAgent: ua,
          path: pathname,
          requestId,
        });
      }
    } catch (err) {
      logger.warn("device sighting failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (!isProtected) return passThrough();

    if (!token || !token.accessToken) {
      if (isApi) {
        return withRequestIdHeaders(
          NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
          requestId,
        );
      }
      return withRequestIdHeaders(
        NextResponse.redirect(new URL("/login", req.url)),
        requestId,
      );
    }

    if (token.keycloakError) {
      if (isApi) {
        return withRequestIdHeaders(
          NextResponse.json({ error: "SessionExpired" }, { status: 401 }),
          requestId,
        );
      }
      return withRequestIdHeaders(
        NextResponse.redirect(new URL("/login?error=SessionExpired", req.url)),
        requestId,
      );
    }

    const accessToken = token.accessToken as string;

    const guard = findMatchingGuard(pathname);
    if (guard) {
      const roles = collectRoles(accessToken);
      if (!hasAny(roles, guard.anyOf, guard.anyPrefix)) {
        if (isApi) {
          return withRequestIdHeaders(
            NextResponse.json({ error: "Forbidden" }, { status: 403 }),
            requestId,
          );
        }
        return withRequestIdHeaders(
          NextResponse.redirect(new URL("/forbidden", req.url)),
          requestId,
        );
      }
    }

    const cacheKey = tokenCacheKey(accessToken);
    const now = Date.now();
    const cached = userinfoCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      if (!cached.valid) {
        if (isApi) {
          return withRequestIdHeaders(
            NextResponse.json({ error: "SessionExpired" }, { status: 401 }),
            requestId,
          );
        }
        return withRequestIdHeaders(
          NextResponse.redirect(new URL("/api/auth/logout", req.url)),
          requestId,
        );
      }
      return passThrough();
    }

    // Lokalna walidacja JWT exp — gdy access token jest świeży (>30s do exp)
    // i podpis OK, ufamy mu bez calling KC userinfo. JWT callback w app/auth
    // odpowiada za refresh przed expiry, więc gdy doszło do middleware token
    // jest valid. Ten skrót redukuje burst 401 cascading przy parallel
    // requestach po refresh oraz lessens KC load.
    try {
      const parts = accessToken.split(".");
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
        const payload = JSON.parse(payloadJson) as { exp?: number };
        if (payload.exp && payload.exp * 1000 > now + 30_000) {
          userinfoCache.set(cacheKey, {
            valid: true,
            expiresAt: now + MIDDLEWARE_USERINFO_CACHE_TTL_MS,
          });
          return passThrough();
        }
      }
    } catch {
      // niepoprawny JWT — leci do KC userinfo dla pewności
    }

    try {
      const issuer = getIssuerForMiddleware();
      if (!issuer) {
        logger.warn("missing keycloak issuer configuration", { requestId });
        return withRequestIdHeaders(
          NextResponse.redirect(new URL("/login?error=Configuration", req.url)),
          requestId,
        );
      }

      const userInfoResponse = await fetch(
        `${issuer}/protocol/openid-connect/userinfo`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(5_000),
        },
      );

      const valid = userInfoResponse.ok;
      userinfoCache.set(cacheKey, {
        valid,
        expiresAt: now + MIDDLEWARE_USERINFO_CACHE_TTL_MS,
      });

      if (!valid) {
        logger.warn("keycloak session invalid", {
          status: userInfoResponse.status,
          pathname,
          requestId,
        });
        if (isApi) {
          return withRequestIdHeaders(
            NextResponse.json({ error: "SessionExpired" }, { status: 401 }),
            requestId,
          );
        }
        return withRequestIdHeaders(
          NextResponse.redirect(new URL("/api/auth/logout", req.url)),
          requestId,
        );
      }
    } catch (err) {
      logger.error("keycloak userinfo check failed", { err, pathname, requestId });
    }

    return passThrough();
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
