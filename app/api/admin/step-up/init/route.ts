export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { canManageCertificates } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface PostPayload {
  action: "panel-mtls-toggle";
  params: { role: "sprzedawca" | "serwisant" | "kierowca"; mtlsRequired: boolean };
  /** URL do którego wracamy po sukcesie. Walidowany — same-origin. */
  returnTo: string;
}

/**
 * Step-up auth via Keycloak redirect (jak Documenso re-auth):
 * 1. Klient POST z opisem akcji → backend generuje nonce/state + zapisuje
 *    intent w HTTP-only cookie (signed JWT, exp 5min).
 * 2. Backend zwraca `authorizeUrl` do KC z prompt=login&max_age=0.
 * 3. Klient nawiguje (window.location) → KC native UI z polem hasła +
 *    "Or sign in with Google".
 * 4. Po sukcesie KC redirectuje na /api/admin/step-up/callback?code&state.
 * 5. Callback weryfikuje state cookie, wymienia code, sprawdza auth_time
 *    fresh i wykonuje akcję, potem redirect na returnTo.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) throw ApiError.unauthorized();
    if (!canManageCertificates(session)) throw ApiError.forbidden("certificates_admin required");

    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.action || !body?.params || !body?.returnTo) {
      throw ApiError.badRequest("action + params + returnTo required");
    }

    // returnTo musi być same-origin path.
    const reqUrl = new URL(req.url);
    const returnUrl = new URL(body.returnTo, reqUrl.origin);
    if (returnUrl.origin !== reqUrl.origin) {
      throw ApiError.badRequest("returnTo must be same-origin");
    }

    const issuer = keycloak.getIssuer();
    const publicIssuer = keycloak.getPublicIssuer();
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    if (!issuer || !clientId) {
      throw new ApiError("SERVICE_UNAVAILABLE", "Keycloak env not configured", 503);
    }

    // Wygeneruj state + signed intent token (krótki JWT 5min).
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      throw new ApiError("SERVICE_UNAVAILABLE", "NEXTAUTH_SECRET not set", 503);
    }
    const { SignJWT } = await import("jose");
    const enc = new TextEncoder();
    const stateNonce = crypto.randomUUID();
    const intent = await new SignJWT({
      action: body.action,
      params: body.params,
      returnTo: returnUrl.pathname + returnUrl.search,
      nonce: stateNonce,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(session.user.email)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(enc.encode(secret));

    // Zapisz intent w HTTP-only cookie. Callback go odczyta i zweryfikuje.
    const jar = await cookies();
    jar.set("step_up_intent", intent, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 300,
    });

    // Zbuduj KC authorize URL z prompt=login (wymusza re-auth).
    const redirectUri = `${reqUrl.origin}/api/admin/step-up/callback`;
    const authorizeUrl = new URL(`${publicIssuer}/protocol/openid-connect/auth`);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "openid profile email");
    authorizeUrl.searchParams.set("state", stateNonce);
    authorizeUrl.searchParams.set("prompt", "login");
    authorizeUrl.searchParams.set("max_age", "0");
    authorizeUrl.searchParams.set("login_hint", session.user.email);

    return createSuccessResponse({ authorizeUrl: authorizeUrl.toString() });
  } catch (error) {
    return handleApiError(error);
  }
}
