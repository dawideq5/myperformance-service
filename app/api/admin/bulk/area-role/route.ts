export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getArea } from "@/lib/permissions/areas";
import { assignUserAreaRole } from "@/lib/permissions/sync";

/**
 * POST /api/admin/bulk/area-role
 *
 * Body: { userIds: string[], areaId: string, roleName: string | null }
 *
 * Dla każdego usera wywołuje `assignUserAreaRole`. Zwraca per-user status
 * (ok|failed + diff dodanych/usuniętych ról).
 */
interface Payload {
  userIds?: string[];
  areaId?: string;
  roleName?: string | null;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const body = (await req.json().catch(() => null)) as Payload | null;
    const userIds = (body?.userIds ?? []).filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    const areaId = body?.areaId;
    if (!areaId) throw ApiError.badRequest("Brak areaId");
    if (!getArea(areaId)) throw ApiError.notFound(`Area ${areaId} nie istnieje`);
    if (userIds.length === 0) throw ApiError.badRequest("Pusta lista userIds");
    if (userIds.length > 200) {
      throw ApiError.badRequest("Max 200 userów w jednym batchu");
    }

    const roleName =
      body?.roleName === undefined || body?.roleName === null
        ? null
        : String(body.roleName);

    const results = await Promise.all(
      userIds.map(async (userId) => {
        try {
          const r = await assignUserAreaRole({ userId, areaId, roleName });
          return { userId, status: "ok" as const, ...r };
        } catch (err) {
          return {
            userId,
            status: "failed" as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const ok = results.filter((r) => r.status === "ok").length;
    const failed = results.length - ok;

    return createSuccessResponse({ total: results.length, ok, failed, results });
  } catch (err) {
    return handleApiError(err);
  }
}
