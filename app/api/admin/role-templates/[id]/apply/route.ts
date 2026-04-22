export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getTemplate } from "@/lib/role-templates";
import { assignUserAreaRole } from "@/lib/permissions/sync";

interface Ctx {
  params: Promise<{ id: string }>;
}

interface ApplyBody {
  userIds: string[];
}

/**
 * POST /api/admin/role-templates/[id]/apply
 *   Body: { userIds: string[] }
 *
 * Dla każdego usera, dla każdego area w template — wywołuje
 * assignUserAreaRole (single-role-per-area enforced, native sync też).
 * Zwraca per-user, per-area rezultat.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const adminToken = await keycloak.getServiceAccountToken();
    const tpl = await getTemplate(adminToken, id);
    if (!tpl) throw ApiError.notFound("Template nie istnieje");

    const body = (await req.json().catch(() => null)) as ApplyBody | null;
    const userIds = Array.isArray(body?.userIds) ? body.userIds : [];
    if (userIds.length === 0) throw ApiError.badRequest("userIds wymagane");

    type UserResult = {
      userId: string;
      assignments: Array<{
        areaId: string;
        status: "ok" | "failed";
        error?: string;
        added?: string[];
        removed?: string[];
        nativeSync?: "ok" | "skipped" | "failed";
      }>;
    };

    const results: UserResult[] = [];
    for (const userId of userIds) {
      const assignments: UserResult["assignments"] = [];
      for (const ar of tpl.areaRoles) {
        try {
          const res = await assignUserAreaRole({
            userId,
            areaId: ar.areaId,
            roleName: ar.roleName,
          });
          assignments.push({
            areaId: ar.areaId,
            status: "ok",
            added: res.added,
            removed: res.removed,
            nativeSync: res.nativeSync,
          });
        } catch (err) {
          assignments.push({
            areaId: ar.areaId,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      results.push({ userId, assignments });
    }

    return createSuccessResponse({
      templateId: id,
      totalUsers: userIds.length,
      results,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
