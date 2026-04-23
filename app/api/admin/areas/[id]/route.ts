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
import { getArea } from "@/lib/permissions/areas";
import { countUsersWithRole } from "@/lib/permissions/sync";
import { getProvider } from "@/lib/permissions/registry";
import type { NativePermission } from "@/lib/permissions/providers/types";
import { resolveRoleCatalog } from "@/lib/permissions/catalog";

/**
 * GET /api/admin/areas/[id]
 *
 * Zwraca szczegóły area — katalog ról (seed + dynamic) i listę
 * natywnych permissions (live z providera). Używane m.in. przez
 * BulkAssignDialog do skonstruowania listy ról do przypisania.
 */
interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    const area = getArea(id);
    if (!area) throw ApiError.notFound(`Area ${id} nie istnieje`);

    const adminToken = await keycloak.getServiceAccountToken();

    const [roles, nativePermissions] = await Promise.all([
      resolveRoleCatalog(area),
      area.provider === "native"
        ? getProvider(area.nativeProviderId)?.listPermissions().catch(() => []) ?? []
        : Promise.resolve([] as NativePermission[]),
    ]);

    const counts = await Promise.all(
      roles.map((r) => countUsersWithRole(adminToken, r.name).catch(() => 0)),
    );

    return createSuccessResponse({
      area: {
        id: area.id,
        label: area.label,
        description: area.description,
        icon: area.icon ?? null,
        provider: area.provider,
        nativeProviderId: area.nativeProviderId ?? null,
        nativeConfigured:
          area.provider === "native"
            ? getProvider(area.nativeProviderId)?.isConfigured() ?? false
            : false,
        dynamicRoles: area.dynamicRoles === true,
        nativeAdminUrl: area.nativeAdminUrl ?? null,
      },
      roles: roles.map((r, i) => ({
        name: r.name,
        label: r.label,
        description: r.description,
        priority: r.priority,
        nativeRoleId: r.nativeRoleId,
        seed: r.seed,
        userCount: counts[i],
      })),
      nativePermissions,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
