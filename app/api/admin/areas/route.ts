export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import { AREAS, listAreaKcRoleNames } from "@/lib/permissions/areas";
import { countUsersWithRole } from "@/lib/permissions/sync";
import { getProvider } from "@/lib/permissions/registry";

/**
 * GET /api/admin/areas
 *
 * Zwraca listę wszystkich obszarów z podstawową telemetrią: czy natywny
 * provider jest configured, ile ról seed w KC, sumaryczny user count
 * (jakikolwiek z seed roles). Używane do listy AreaCard w /admin/users.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const adminToken = await keycloak.getServiceAccountToken();

    const results = await Promise.all(
      AREAS.map(async (area) => {
        const seedRoles = listAreaKcRoleNames(area);
        const counts = await Promise.all(
          seedRoles.map((name) =>
            countUsersWithRole(adminToken, name).catch(() => 0),
          ),
        );
        const totalSeeded = counts.reduce((a, b) => a + b, 0);

        const provider =
          area.provider === "native" ? getProvider(area.nativeProviderId) : null;

        return {
          id: area.id,
          label: area.label,
          description: area.description,
          icon: area.icon ?? null,
          provider: area.provider,
          nativeProviderId: area.nativeProviderId ?? null,
          nativeConfigured: provider?.isConfigured() ?? false,
          supportsCustomRoles: provider?.supportsCustomRoles() ?? false,
          nativeAdminUrl: area.nativeAdminUrl ?? null,
          seedRoles: area.kcRoles.map((r, i) => ({
            name: r.name,
            description: r.description,
            priority: r.priority,
            nativeRoleId: r.nativeRoleId ?? null,
            userCount: counts[i],
          })),
          totalAssignedUsers: totalSeeded,
        };
      }),
    );

    return createSuccessResponse({ areas: results });
  } catch (err) {
    return handleApiError(err);
  }
}
