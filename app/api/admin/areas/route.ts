export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import { AREAS } from "@/lib/permissions/areas";
import { countUsersWithRole } from "@/lib/permissions/sync";
import { getProvider } from "@/lib/permissions/registry";
import { resolveRoleCatalog } from "@/lib/permissions/catalog";

/**
 * GET /api/admin/areas
 *
 * Zwraca listę obszarów z jednolitym katalogiem ról (seed + dynamic).
 * Każda rola ma `label` (PL, do UI), `name` (KC realm role), oraz
 * metadane (provider native id, user count). Dla area z `dynamicRoles=true`
 * pobieramy ról z `provider.listRoles()` i dołączamy je do seedów.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const adminToken = await keycloak.getServiceAccountToken();

    const results = await Promise.all(
      AREAS.map(async (area) => {
        const provider =
          area.provider === "native" ? getProvider(area.nativeProviderId) : null;

        const mergedRoles = await resolveRoleCatalog(area);

        const counts = await Promise.all(
          mergedRoles.map((r) =>
            countUsersWithRole(adminToken, r.name).catch(() => 0),
          ),
        );
        const totalAssigned = counts.reduce((a, b) => a + b, 0);

        return {
          id: area.id,
          label: area.label,
          description: area.description,
          icon: area.icon ?? null,
          provider: area.provider,
          nativeProviderId: area.nativeProviderId ?? null,
          nativeConfigured: provider?.isConfigured() ?? false,
          dynamicRoles: area.dynamicRoles === true,
          nativeAdminUrl: area.nativeAdminUrl ?? null,
          roles: mergedRoles.map((r, i) => ({
            name: r.name,
            label: r.label,
            description: r.description,
            priority: r.priority,
            nativeRoleId: r.nativeRoleId,
            seed: r.seed,
            userCount: counts[i],
          })),
          totalAssignedUsers: totalAssigned,
        };
      }),
    );

    return createSuccessResponse({ areas: results });
  } catch (err) {
    return handleApiError(err);
  }
}

