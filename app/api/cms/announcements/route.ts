export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { hasArea } from "@/lib/admin-auth";
import { getActiveAnnouncements } from "@/lib/directus-cms";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const all = await getActiveAnnouncements();
    const visible = all.filter(
      (a) => !a.requiresArea || hasArea(session, a.requiresArea),
    );

    return createSuccessResponse({ announcements: visible });
  } catch (error) {
    return handleApiError(error);
  }
}
