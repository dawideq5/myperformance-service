export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Wave 20 / Faza 1G — UI customization prefs dla Service detail view
 * w panelu serwisanta.
 *
 * Auth model: dwa źródła session — NextAuth cookie (gdy user otwiera
 * z dashboardu) i Bearer KC access-token (gdy panel-serwisant relayuje
 * przez `/api/relay/account/preferences/serwisant-detail`). Bearer
 * waliduje przez `getPanelUserFromRequest` (KC userinfo) i mapuje email
 * na user_id (Keycloak `preferred_username`/email — w mp_user_preferences
 * trzymamy stable user_id z next-auth `session.user.id` lub email gdy
 * Bearer flow). Backend prefs jest user-id-keyed, więc gdy Bearer flow
 * używamy `email` jako primary key (KC sub byłby lepszy, ale userinfo
 * email jest deterministic dla naszego realm + 1:1 z KC user, więc OK).
 */

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import {
  DEFAULT_SERWISANT_DETAIL_PREFS,
  getServiceDetailViewPrefs,
  setServiceDetailViewPrefs,
  type ServiceDetailDensity,
  type ServiceDetailFontSize,
  type ServiceDetailViewPrefs,
} from "@/lib/preferences";
import { getPanelUserFromRequest, PANEL_CORS_HEADERS } from "@/lib/panel-auth";

const DENSITY_VALUES: ServiceDetailDensity[] = ["compact", "comfortable"];
const FONT_SIZE_VALUES: ServiceDetailFontSize[] = ["small", "normal", "large"];

/**
 * Resolve user_id from request — najpierw NextAuth (dashboard origin),
 * fallback Bearer KC token (panel relay). Zwraca null gdy żadne nie pasuje.
 *
 * Klucz jest wspólny dla obu flow:
 *   - dashboard: `session.user.id` = KC `sub` (z `app/auth.ts` callbacks)
 *   - panel: `userinfo.sub` z KC userinfo (extracted w panel-auth)
 *
 * Fallback na email gdy `sub` brak (legacy tokens) — kompromis pomiędzy
 * stabilnością a backward-compat.
 */
async function resolveUserId(request: Request): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (sessionUserId) return sessionUserId;

  const panelUser = await getPanelUserFromRequest(request);
  if (panelUser?.sub) return panelUser.sub;
  if (panelUser?.email) return panelUser.email;

  return null;
}

interface PatchBody {
  tabOrder?: string[] | null;
  tabVisibility?: Record<string, boolean>;
  density?: string;
  fontSize?: string;
  defaultLandingTab?: string;
}

function sanitizePatch(body: PatchBody): Partial<ServiceDetailViewPrefs> {
  const patch: Partial<ServiceDetailViewPrefs> = {};

  if (body.tabOrder === null) {
    patch.tabOrder = null;
  } else if (Array.isArray(body.tabOrder)) {
    patch.tabOrder = body.tabOrder.filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
  }

  if (body.tabVisibility && typeof body.tabVisibility === "object") {
    const filtered: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(body.tabVisibility)) {
      if (typeof k === "string" && typeof v === "boolean") {
        filtered[k] = v;
      }
    }
    patch.tabVisibility = filtered;
  }

  if (typeof body.density === "string") {
    if (!DENSITY_VALUES.includes(body.density as ServiceDetailDensity)) {
      throw ApiError.badRequest(
        `density must be one of: ${DENSITY_VALUES.join(", ")}`,
      );
    }
    patch.density = body.density as ServiceDetailDensity;
  }

  if (typeof body.fontSize === "string") {
    if (!FONT_SIZE_VALUES.includes(body.fontSize as ServiceDetailFontSize)) {
      throw ApiError.badRequest(
        `fontSize must be one of: ${FONT_SIZE_VALUES.join(", ")}`,
      );
    }
    patch.fontSize = body.fontSize as ServiceDetailFontSize;
  }

  if (typeof body.defaultLandingTab === "string") {
    patch.defaultLandingTab = body.defaultLandingTab;
  }

  return patch;
}

export async function GET(request: Request) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) throw ApiError.unauthorized();
    const prefs = await getServiceDetailViewPrefs(userId);
    return createSuccessResponse({
      prefs,
      defaults: DEFAULT_SERWISANT_DETAIL_PREFS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) throw ApiError.unauthorized();

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Invalid JSON body");
    }

    const patch = sanitizePatch(body);
    const next = await setServiceDetailViewPrefs(userId, patch);
    return createSuccessResponse({ prefs: next });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: PANEL_CORS_HEADERS,
  });
}
