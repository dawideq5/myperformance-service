export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { canAccessKeycloakAdmin, canManageCertificates } from "@/lib/admin-auth";
import { listLocationAudit } from "@/lib/location-audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    if (!canManageCertificates(session) && !canAccessKeycloakAdmin(session)) {
      throw ApiError.forbidden("Brak uprawnień");
    }
    const { id } = await params;
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? undefined;
    const actionType = url.searchParams.get("action") ?? undefined;
    const since = url.searchParams.get("since") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? "100");

    const entries = await listLocationAudit({
      locationId: id,
      userId,
      actionType,
      since,
      limit: Number.isFinite(limit) ? limit : 100,
    });
    return createSuccessResponse({ entries });
  } catch (error) {
    return handleApiError(error);
  }
}
