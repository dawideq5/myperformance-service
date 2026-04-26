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
import {
  assignUserAreaRole,
  getUserAreaAssignments,
} from "@/lib/permissions/sync";
import { notifyUser } from "@/lib/notify";

/**
 * GET /api/admin/users/[id]/area-role
 *   → lista { areaId, roleName } dla wszystkich obszarów.
 *
 * POST /api/admin/users/[id]/area-role
 *   Body: { areaId: string, roleName: string | null }
 *   Wymusza single-role-per-area (usuwa overlapy, dodaje requestowaną).
 */
interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Brak user id");

    const assignments = await getUserAreaAssignments(id);
    return createSuccessResponse({ assignments });
  } catch (err) {
    return handleApiError(err);
  }
}

interface PostPayload {
  areaId?: string;
  roleName?: string | null;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Brak user id");

    const body = (await req.json().catch(() => null)) as PostPayload | null;
    const areaId = body?.areaId;
    if (!areaId) throw ApiError.badRequest("Brak areaId");
    if (!getArea(areaId)) throw ApiError.notFound(`Area ${areaId} nie istnieje`);

    const roleName =
      body?.roleName === undefined || body?.roleName === null
        ? null
        : String(body.roleName);

    const result = await assignUserAreaRole({
      userId: id,
      areaId,
      roleName,
    });

    const area = getArea(areaId);
    if (roleName) {
      void notifyUser(id, "account.role.assigned", {
        title: `Przypisano rolę w ${area?.label ?? areaId}`,
        body: `Otrzymałeś rolę "${roleName}" w obszarze ${area?.label ?? areaId}. Możesz teraz korzystać z funkcji tej aplikacji.`,
        severity: "info",
        payload: { areaId, roleName },
      });
    } else {
      void notifyUser(id, "account.role.revoked", {
        title: `Cofnięto rolę w ${area?.label ?? areaId}`,
        body: `Twoja rola w obszarze ${area?.label ?? areaId} została cofnięta.`,
        severity: "warning",
        payload: { areaId },
      });
    }

    return createSuccessResponse({ result });
  } catch (err) {
    return handleApiError(err);
  }
}
