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
  enrolUserInOnboarding,
  isMoodleConfigured,
  markOnboardingCompleted,
} from "@/lib/moodle";
import { setUserPreferences } from "@/lib/preferences";

/**
 * POST /api/account/onboarding
 *   { action: "enrol" | "complete", tourId?: string }
 *
 * - enrol: ensure Moodle course "Onboarding MyPerformance" + enrol usera.
 *   Zapisuje courseId w prefs.moodleCourseId.
 * - complete: oznacza Moodle course completed (best-effort) + dopisuje
 *   tourId do prefs.introCompletedSteps.
 */

interface PostBody {
  action?: "enrol" | "complete";
  tourId?: string;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const userId = session.user?.id;
    const email = session.user?.email;
    if (!userId || !email) throw ApiError.unauthorized();

    const body = (await req.json().catch(() => null)) as PostBody | null;
    if (!body?.action) throw ApiError.badRequest("Missing action");

    if (!isMoodleConfigured()) {
      return createSuccessResponse({
        ok: false,
        reason: "moodle_not_configured",
      });
    }

    if (body.action === "enrol") {
      const r = await enrolUserInOnboarding(email);
      if (r.enrolled) {
        await setUserPreferences(userId, { moodleCourseId: r.courseId });
      }
      return createSuccessResponse({
        ok: r.enrolled,
        courseId: r.courseId,
      });
    }

    if (body.action === "complete") {
      const completed = await markOnboardingCompleted(email);
      if (body.tourId) {
        const { getUserPreferences } = await import("@/lib/preferences");
        const current = await getUserPreferences(userId);
        if (!current.introCompletedSteps.includes(body.tourId)) {
          await setUserPreferences(userId, {
            introCompletedSteps: [
              ...current.introCompletedSteps,
              body.tourId,
            ],
          });
        }
      }
      return createSuccessResponse({ ok: completed });
    }

    throw ApiError.badRequest("Unknown action");
  } catch (error) {
    return handleApiError(error);
  }
}
