export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import {
  NOTIF_EVENTS,
  getUserPreferences,
  setUserPreferences,
  type NotifEventKey,
  type UserPreferences,
} from "@/lib/preferences";

function userId(session: { user?: { id?: string } }): string {
  const id = session.user?.id;
  if (!id) throw ApiError.unauthorized();
  return id;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const prefs = await getUserPreferences(userId(session));
    return createSuccessResponse({
      prefs,
      catalog: NOTIF_EVENTS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PatchBody {
  hintsEnabled?: boolean;
  notifInApp?: Record<string, boolean>;
  notifEmail?: Record<string, boolean>;
  introCompletedSteps?: string[];
  moodleCourseId?: number;
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Invalid JSON body");
    }

    const patch: Partial<UserPreferences> = {};

    if (typeof body.hintsEnabled === "boolean") {
      patch.hintsEnabled = body.hintsEnabled;
    }

    if (body.notifInApp && typeof body.notifInApp === "object") {
      const filtered: Partial<Record<NotifEventKey, boolean>> = {};
      for (const [k, v] of Object.entries(body.notifInApp)) {
        if (k in NOTIF_EVENTS && typeof v === "boolean") {
          filtered[k as NotifEventKey] = v;
        }
      }
      patch.notifInApp = filtered;
    }

    if (body.notifEmail && typeof body.notifEmail === "object") {
      const filtered: Partial<Record<NotifEventKey, boolean>> = {};
      for (const [k, v] of Object.entries(body.notifEmail)) {
        if (k in NOTIF_EVENTS && typeof v === "boolean") {
          filtered[k as NotifEventKey] = v;
        }
      }
      patch.notifEmail = filtered;
    }

    if (Array.isArray(body.introCompletedSteps)) {
      patch.introCompletedSteps = body.introCompletedSteps.filter(
        (s): s is string => typeof s === "string",
      );
    }

    if (typeof body.moodleCourseId === "number") {
      patch.moodleCourseId = body.moodleCourseId;
    }

    const next = await setUserPreferences(userId(session), patch);
    return createSuccessResponse({ prefs: next });
  } catch (error) {
    return handleApiError(error);
  }
}
