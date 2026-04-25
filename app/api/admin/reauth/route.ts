export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface PostPayload {
  password: string;
  /** Cel re-auth — wpisany w `purpose` claim wystawionego tokenu. */
  purpose: string;
}

/**
 * Step-up reauthentication via Keycloak Resource Owner Password grant.
 * Po sukcesie wystawiamy short-lived (5 min) signed token z polem `purpose`,
 * który destructive endpoints weryfikują przed wykonaniem akcji.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) throw ApiError.unauthorized();
    const email = session.user.email;

    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.password || !body?.purpose) {
      throw ApiError.badRequest("password + purpose required");
    }

    const issuer = keycloak.getIssuer();
    const clientId = process.env.KEYCLOAK_CLIENT_ID || "";
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || "";
    if (!issuer || !clientId || !clientSecret) {
      throw new ApiError("SERVICE_UNAVAILABLE", "Keycloak env not configured", 503);
    }

    const params = new URLSearchParams();
    params.set("grant_type", "password");
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
    params.set("username", email);
    params.set("password", body.password);
    params.set("scope", "openid");

    const tokenRes = await fetch(`${issuer.replace(/\/$/, "")}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!tokenRes.ok) {
      throw ApiError.forbidden("Nieprawidłowe hasło");
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      throw new ApiError("SERVICE_UNAVAILABLE", "NEXTAUTH_SECRET not set", 503);
    }
    const { SignJWT } = await import("jose");
    const enc = new TextEncoder();
    const stepUpToken = await new SignJWT({ purpose: body.purpose })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(email)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(enc.encode(secret));

    return createSuccessResponse({ stepUpToken, expiresIn: 300 });
  } catch (error) {
    return handleApiError(error);
  }
}
