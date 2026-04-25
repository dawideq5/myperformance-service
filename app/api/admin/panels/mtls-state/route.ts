export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import { getOptionalEnv } from "@/lib/env";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

const PANELS = [
  {
    role: "sprzedawca",
    label: "Panel Sprzedawcy",
    domain: "panelsprzedawcy.myperformance.pl",
    coolifyUuid: "j25t315yl6ei2yrqsu8678hl",
  },
  {
    role: "serwisant",
    label: "Panel Serwisanta",
    domain: "panelserwisanta.myperformance.pl",
    coolifyUuid: "h2azkj3hconcktdleledntcj",
  },
  {
    role: "kierowca",
    label: "Panel Kierowcy",
    domain: "panelkierowcy.myperformance.pl",
    coolifyUuid: "wx710sd7tvmu9f7qsbu907u3",
  },
] as const;

export type PanelRole = (typeof PANELS)[number]["role"];

interface PanelState {
  role: PanelRole;
  label: string;
  domain: string;
  mtlsRequired: boolean;
  coolifyUuid: string;
}

async function fetchPanelEnvs(uuid: string): Promise<Record<string, string>> {
  const token = getOptionalEnv("COOLIFY_API_TOKEN");
  const apiBase = getOptionalEnv("COOLIFY_API_URL") || "https://coolify.myperformance.pl/api/v1";
  if (!token) return {};
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/applications/${uuid}/envs`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return {};
    const arr = (await res.json()) as Array<{ key: string; value: string }>;
    const out: Record<string, string> = {};
    for (const e of arr) out[e.key] = e.value;
    return out;
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) throw ApiError.unauthorized();
    if (!canManageCertificates(session)) throw ApiError.forbidden("certificates_admin required");

    const states: PanelState[] = await Promise.all(
      PANELS.map(async (p) => {
        const envs = await fetchPanelEnvs(p.coolifyUuid);
        // MTLS_REQUIRED=true (Coolify env) — panel middleware blocks bez cert.
        // Default false (user może chwilowo rozluźnić wymóg).
        const required = (envs["MTLS_REQUIRED"] ?? "false").toLowerCase() === "true";
        return {
          role: p.role,
          label: p.label,
          domain: p.domain,
          mtlsRequired: required,
          coolifyUuid: p.coolifyUuid,
        };
      }),
    );

    return createSuccessResponse({ panels: states });
  } catch (error) {
    return handleApiError(error);
  }
}
