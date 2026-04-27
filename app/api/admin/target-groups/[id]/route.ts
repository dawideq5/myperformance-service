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
  deleteTargetGroup,
  updateTargetGroup,
  type TargetGroupInput,
} from "@/lib/target-groups";

import type { Session } from "next-auth";

function requireAdmin(session: Session) {
  if (!canAccessConfigHub(session)) {
    throw ApiError.forbidden("Wymagane uprawnienia admina (config_admin)");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    requireAdmin(session);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as
      | Partial<TargetGroupInput>
      | null;
    if (!body) throw ApiError.badRequest("Invalid JSON body");
    try {
      const group = await updateTargetGroup(id, body);
      return createSuccessResponse({ group });
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    requireAdmin(session);
    const { id } = await params;
    await deleteTargetGroup(id);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
