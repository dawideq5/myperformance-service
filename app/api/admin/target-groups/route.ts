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
  createTargetGroup,
  listTargetGroups,
  listTargetThresholds,
  type TargetGroupInput,
} from "@/lib/target-groups";

import type { Session } from "next-auth";

function requireAdmin(session: Session) {
  if (!canAccessConfigHub(session)) {
    throw ApiError.forbidden("Wymagane uprawnienia admina (config_admin)");
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const [groups, thresholds] = await Promise.all([
      listTargetGroups(),
      listTargetThresholds(),
    ]);
    // Zwracamy progi pogrupowane per group, żeby klient nie musiał
    // łączyć — UI od razu pokazuje grupę z jej progami.
    const byGroup: Record<string, typeof thresholds> = {};
    for (const t of thresholds) {
      (byGroup[t.groupId] ??= []).push(t);
    }
    return createSuccessResponse({ groups, thresholdsByGroup: byGroup });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    requireAdmin(session);
    const body = (await req.json().catch(() => null)) as TargetGroupInput | null;
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Invalid JSON body");
    }
    try {
      const group = await createTargetGroup(body);
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
