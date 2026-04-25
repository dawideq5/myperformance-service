export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { auditLog } from "@/lib/step-ca";

const PANEL_BY_ROLE: Record<string, string> = {
  sprzedawca: "j25t315yl6ei2yrqsu8678hl",
  serwisant: "h2azkj3hconcktdleledntcj",
  kierowca: "wx710sd7tvmu9f7qsbu907u3",
};

interface IntentPayload {
  action: "panel-mtls-toggle";
  params: { role: string; mtlsRequired: boolean };
  returnTo: string;
  nonce: string;
}

function redirectWithMessage(origin: string, returnTo: string, kind: "ok" | "err", msg: string) {
  const url = new URL(returnTo, origin);
  url.searchParams.set(kind === "ok" ? "step_up_ok" : "step_up_err", msg);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const error = reqUrl.searchParams.get("error");
  const origin = (process.env.NEXTAUTH_URL || reqUrl.origin).replace(/\/$/, "");

  const jar = await cookies();
  const intentCookie = jar.get("step_up_intent")?.value;
  jar.delete("step_up_intent");

  if (!intentCookie) {
    return redirectWithMessage(origin, "/dashboard/step-ca", "err", "Brak kontekstu re-auth");
  }

  // Verify intent JWT
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return redirectWithMessage(origin, "/dashboard/step-ca", "err", "Brak konfiguracji");
  }
  const { jwtVerify } = await import("jose");
  const enc = new TextEncoder();
  let intent: IntentPayload | null = null;
  let actorEmail = "";
  try {
    const { payload } = await jwtVerify(intentCookie, enc.encode(secret), {
      algorithms: ["HS256"],
    });
    intent = {
      action: payload.action as IntentPayload["action"],
      params: payload.params as IntentPayload["params"],
      returnTo: payload.returnTo as string,
      nonce: payload.nonce as string,
    };
    actorEmail = payload.sub as string;
  } catch {
    return redirectWithMessage(origin, "/dashboard/step-ca", "err", "Nieprawidłowy intent");
  }

  if (state !== intent.nonce) {
    return redirectWithMessage(origin, intent.returnTo, "err", "State mismatch");
  }
  if (error || !code) {
    return redirectWithMessage(origin, intent.returnTo, "err", error || "Anulowano");
  }

  // Sprawdź sesję — actor musi być tym samym userem co session.
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email !== actorEmail) {
    return redirectWithMessage(origin, intent.returnTo, "err", "Brak sesji");
  }

  // Wymień code → token + zweryfikuj auth_time fresh (< 60s).
  const issuer = keycloak.getIssuer();
  const clientId = process.env.KEYCLOAK_CLIENT_ID || "";
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || "";
  const redirectUri = `${(process.env.NEXTAUTH_URL || origin).replace(/\/$/, "")}/api/admin/step-up/callback`;
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", redirectUri);
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  const tokenRes = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!tokenRes.ok) {
    return redirectWithMessage(origin, intent.returnTo, "err", "Token exchange failed");
  }
  const tokenJson = (await tokenRes.json()) as { access_token: string; id_token?: string };

  // Decode id_token żeby sprawdzić auth_time.
  const idToken = tokenJson.id_token;
  if (!idToken) {
    return redirectWithMessage(origin, intent.returnTo, "err", "Brak id_token");
  }
  const idPayload = JSON.parse(
    Buffer.from(idToken.split(".")[1], "base64url").toString("utf-8"),
  ) as { auth_time?: number; email?: string; sub?: string };
  const nowSec = Math.floor(Date.now() / 1000);
  if (!idPayload.auth_time || nowSec - idPayload.auth_time > 60) {
    return redirectWithMessage(origin, intent.returnTo, "err", "Re-auth zbyt stary");
  }
  if (idPayload.email && idPayload.email !== actorEmail) {
    return redirectWithMessage(origin, intent.returnTo, "err", "Email mismatch");
  }

  // Wykonaj akcję.
  if (intent.action === "panel-mtls-toggle") {
    const uuid = PANEL_BY_ROLE[intent.params.role];
    if (!uuid) {
      return redirectWithMessage(origin, intent.returnTo, "err", "Nieznany panel");
    }
    const coolifyToken = process.env.COOLIFY_API_TOKEN;
    const apiBase = process.env.COOLIFY_API_URL || "https://coolify.myperformance.pl/api/v1";
    if (!coolifyToken) {
      return redirectWithMessage(origin, intent.returnTo, "err", "COOLIFY_API_TOKEN missing");
    }
    const envRes = await fetch(`${apiBase.replace(/\/$/, "")}/applications/${uuid}/envs`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${coolifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: "MTLS_REQUIRED", value: String(intent.params.mtlsRequired) }),
    });
    if (!envRes.ok && envRes.status !== 201) {
      auditLog({
        ts: new Date().toISOString(),
        actor: actorEmail,
        action: "panel-mtls-toggle",
        subject: `${intent.params.role}=${intent.params.mtlsRequired}`,
        ok: false,
        error: `Coolify env PATCH ${envRes.status}`,
      });
      return redirectWithMessage(origin, intent.returnTo, "err", "Coolify env PATCH failed");
    }
    const deployRes = await fetch(
      `${apiBase.replace(/\/$/, "")}/deploy?uuid=${uuid}&force=true`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${coolifyToken}` },
      },
    );
    auditLog({
      ts: new Date().toISOString(),
      actor: actorEmail,
      action: "panel-mtls-toggle",
      subject: `${intent.params.role}=${intent.params.mtlsRequired}`,
      ok: deployRes.ok,
      error: deployRes.ok ? undefined : `Redeploy ${deployRes.status}`,
    });
    if (!deployRes.ok) {
      return redirectWithMessage(origin, intent.returnTo, "err", "Redeploy failed");
    }
    const verb = intent.params.mtlsRequired ? "włączony" : "wyłączony";
    return redirectWithMessage(
      origin,
      intent.returnTo,
      "ok",
      `mTLS ${verb} dla panelu ${intent.params.role}. Panel restartuje się…`,
    );
  }

  return redirectWithMessage(origin, intent.returnTo, "err", "Nieznana akcja");
}
