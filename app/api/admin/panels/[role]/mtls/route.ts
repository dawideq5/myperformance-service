export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import { getOptionalEnv } from "@/lib/env";
import { auditLog } from "@/lib/step-ca";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ role: string }>;
}

const PANEL_BY_ROLE: Record<string, string> = {
  sprzedawca: "j25t315yl6ei2yrqsu8678hl",
  serwisant: "h2azkj3hconcktdleledntcj",
  kierowca: "wx710sd7tvmu9f7qsbu907u3",
};

interface PostPayload {
  mtlsRequired: boolean;
  /**
   * Step-up reauth token — krótkotrwały token wystawiony przez
   * `/api/admin/reauth` (KC password grant). Wymagany dla destructive
   * operacji bezpieczeństwa.
   */
  stepUpToken: string;
}

async function verifyStepUpToken(token: string, userEmail: string): Promise<boolean> {
  // Token wygenerowany przez /api/admin/reauth — JWT signed sekretem
  // NEXTAUTH_SECRET, exp 5min, sub=email.
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || !token) return false;
  try {
    const { jwtVerify } = await import("jose");
    const enc = new TextEncoder();
    const { payload } = await jwtVerify(token, enc.encode(secret), {
      algorithms: ["HS256"],
    });
    if (payload.sub !== userEmail) return false;
    if (payload.purpose !== "step-up:mtls-toggle") return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) throw ApiError.unauthorized();
    if (!canManageCertificates(session)) throw ApiError.forbidden("certificates_admin required");

    const { role } = await params;
    const uuid = PANEL_BY_ROLE[role];
    if (!uuid) throw ApiError.notFound("Unknown panel role");

    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (typeof body?.mtlsRequired !== "boolean" || !body?.stepUpToken) {
      throw ApiError.badRequest("mtlsRequired + stepUpToken required");
    }

    const userEmail = session.user?.email ?? "";
    const ok = await verifyStepUpToken(body.stepUpToken, userEmail);
    if (!ok) throw ApiError.forbidden("Step-up authentication required");

    const coolifyToken = getOptionalEnv("COOLIFY_API_TOKEN");
    const apiBase =
      getOptionalEnv("COOLIFY_API_URL") || "https://coolify.myperformance.pl/api/v1";
    if (!coolifyToken) {
      throw new ApiError("SERVICE_UNAVAILABLE", "COOLIFY_API_TOKEN not configured", 503);
    }

    // PATCH env MTLS_REQUIRED.
    const envRes = await fetch(`${apiBase.replace(/\/$/, "")}/applications/${uuid}/envs`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${coolifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: "MTLS_REQUIRED", value: String(body.mtlsRequired) }),
    });
    if (!envRes.ok && envRes.status !== 201) {
      // 201 = created, 204 = updated; inne = error
      const text = await envRes.text();
      throw new ApiError("SERVICE_UNAVAILABLE", `Coolify env PATCH failed: ${envRes.status} ${text.slice(0, 200)}`, envRes.status);
    }

    // Trigger redeploy.
    const deployRes = await fetch(
      `${apiBase.replace(/\/$/, "")}/deploy?uuid=${uuid}&force=true`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${coolifyToken}` },
      },
    );
    if (!deployRes.ok) {
      // Env zmieniony ale redeploy zawiódł — informujemy.
      auditLog({
        ts: new Date().toISOString(),
        actor: userEmail,
        action: "panel-mtls-toggle",
        subject: `${role}=${body.mtlsRequired}`,
        ok: false,
        error: `Redeploy failed: ${deployRes.status}`,
      });
      throw new ApiError("SERVICE_UNAVAILABLE", "Env updated but redeploy failed", 502);
    }

    auditLog({
      ts: new Date().toISOString(),
      actor: userEmail,
      action: "panel-mtls-toggle",
      subject: `${role}=${body.mtlsRequired}`,
      ok: true,
    });

    return createSuccessResponse({
      ok: true,
      role,
      mtlsRequired: body.mtlsRequired,
      message:
        "Środowisko zaktualizowane. Redeploy panelu w toku — zmiana wejdzie w życie po ~1 min.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
