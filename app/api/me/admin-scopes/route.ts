export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { getAdminScopes, isSuperAdmin } from "@/lib/admin-auth";
import { ApiError, createSuccessResponse, handleApiError } from "@/lib/api-utils";

/**
 * GET /api/me/admin-scopes
 *
 * Zwraca listę area'ów które aktualny user może adminować + flagę
 * superadmin. Używane przez UI do renderowania zakładek/kafelków
 * wyłącznie tych panelów do których user ma dostęp.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    return createSuccessResponse({
      superAdmin: isSuperAdmin(session),
      scopes: getAdminScopes(session),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
