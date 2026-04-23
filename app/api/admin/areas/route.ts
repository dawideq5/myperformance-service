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
 * Required env vars per provider — gdy provider jest offline, UI pokaże
 * te nazwy żeby admin wiedział co dodać do konfiguracji Coolify/ENV.
 *
 * Źródło: `getConfig()` każdego providera w `lib/permissions/providers/*`.
 */
const REQUIRED_ENV_BY_PROVIDER: Record<string, string[]> = {
  chatwoot: ["CHATWOOT_URL", "CHATWOOT_API_ACCESS_TOKEN"],
  moodle: ["MOODLE_URL", "MOODLE_API_TOKEN"],
  directus: ["DIRECTUS_URL", "DIRECTUS_ADMIN_TOKEN"],
  documenso: ["DOCUMENSO_DB_URL"],
  outline: ["OUTLINE_URL", "OUTLINE_API_TOKEN"],
  postal: ["POSTAL_DB_HOST", "POSTAL_DB_USER", "POSTAL_DB_PASSWORD"],
};

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

        const requiredEnv =
          area.provider === "native" && area.nativeProviderId
            ? REQUIRED_ENV_BY_PROVIDER[area.nativeProviderId] ?? []
            : [];
        const missingEnv =
          area.provider === "native"
            ? requiredEnv.filter((k) => !process.env[k])
            : [];

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
          requiredEnv,
          missingEnv,
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

