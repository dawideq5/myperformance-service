export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { canAccessConfigHub } from "@/lib/admin-auth";
import {
  deleteTargetThreshold,
  updateTargetThreshold,
  type TargetThresholdInput,
} from "@/lib/target-groups";

import type { Session } from "next-auth";

function requireAdmin(session: Session) {
  if (!canAccessConfigHub(session)) {
    throw ApiError.forbidden("Wymagane uprawnienia admina (config_admin)");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; thresholdId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    requireAdmin(session);
    const { thresholdId } = await params;
    const body = (await req.json().catch(() => null)) as
      | Partial<TargetThresholdInput>
      | null;
    if (!body) throw ApiError.badRequest("Invalid JSON body");
    try {
      const threshold = await updateTargetThreshold(thresholdId, body);
      return createSuccessResponse({ threshold });
    } catch (err) {
      throw ApiError.badRequest(
        err instanceof Error ? err.message : String(err),
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; thresholdId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    requireAdmin(session);
    const { thresholdId } = await params;
    await deleteTargetThreshold(thresholdId);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
