export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import { syncAreasToKeycloak } from "@/lib/permissions/kc-sync";

interface Payload {
  /** Gdy true — usuwa z realmu role oznaczone `areaId` attr, których nie
   * ma w bieżącym seed + provider-dynamic. Domyślnie false — bezpiecznie. */
  deleteStale?: boolean;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const body = (await req.json().catch(() => ({}))) as Payload;
    const actor = session.user?.email || session.user?.id || "admin";

    const result = await syncAreasToKeycloak({
      actor: `admin:${actor}`,
      deleteStale: body.deleteStale === true,
    });

    return createSuccessResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
