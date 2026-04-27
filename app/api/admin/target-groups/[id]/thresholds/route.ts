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
  createTargetThreshold,
  listTargetThresholds,
  type TargetThresholdInput,
} from "@/lib/target-groups";

import type { Session } from "next-auth";

function requireAdmin(session: Session) {
  if (!canAccessConfigHub(session)) {
    throw ApiError.forbidden("Wymagane uprawnienia admina (config_admin)");
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const { id } = await params;
    const thresholds = await listTargetThresholds(id);
    return createSuccessResponse({ thresholds });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    requireAdmin(session);
    const { id: groupId } = await params;
    const body = (await req.json().catch(() => null)) as
      | Omit<TargetThresholdInput, "groupId">
      | null;
    if (!body) throw ApiError.badRequest("Invalid JSON body");
    try {
      const threshold = await createTargetThreshold({ ...body, groupId });
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
