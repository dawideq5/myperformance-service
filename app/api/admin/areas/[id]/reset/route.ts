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

/**
 * POST /api/admin/areas/[id]/reset
 *
 * Factory-reset: odtwarza seed role realm Keycloak dla wskazanego area
 * (tworzy brakujące + aktualizuje description). Operacja idempotentna —
 * nie narusza przypisań userów, nie kasuje ról custom.
 */
interface Ctx {
  params: Promise<{ id: string }>;
}

interface RoleRepresentation {
  id: string;
  name: string;
  description?: string;
  attributes?: Record<string, string[]>;
}

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    const area = getArea(id);
    if (!area) throw ApiError.notFound(`Area ${id} nie istnieje`);

    const adminToken = await keycloak.getServiceAccountToken();

    const results: Array<{
      name: string;
      action: "created" | "updated" | "ok";
    }> = [];

    for (const seed of area.kcRoles) {
      const probe = await keycloak.adminRequest(
        `/roles/${encodeURIComponent(seed.name)}`,
        adminToken,
      );
      if (probe.status === 404) {
        const create = await keycloak.adminRequest(`/roles`, adminToken, {
          method: "POST",
          body: JSON.stringify({
            name: seed.name,
            description: seed.description,
            attributes: {
              areaId: [area.id],
              ...(seed.nativeRoleId
                ? { nativeRoleId: [seed.nativeRoleId] }
                : {}),
            },
          }),
        });
        if (!create.ok && create.status !== 409) {
          const body = await create.text().catch(() => "");
          throw ApiError.serviceUnavailable(
            `create role ${seed.name}: ${create.status} ${body.slice(0, 200)}`,
          );
        }
        results.push({ name: seed.name, action: "created" });
        continue;
      }
      if (!probe.ok) {
        throw ApiError.serviceUnavailable(
          `probe role ${seed.name}: ${probe.status}`,
        );
      }
      const existing = (await probe.json()) as RoleRepresentation;
      const attrChanged =
        existing.attributes?.areaId?.[0] !== area.id ||
        (seed.nativeRoleId
          ? existing.attributes?.nativeRoleId?.[0] !== seed.nativeRoleId
          : false);
      if (existing.description === seed.description && !attrChanged) {
        results.push({ name: seed.name, action: "ok" });
        continue;
      }
      const upd = await keycloak.adminRequest(
        `/roles-by-id/${existing.id}`,
        adminToken,
        {
          method: "PUT",
          body: JSON.stringify({
            ...existing,
            description: seed.description,
            attributes: {
              ...(existing.attributes ?? {}),
              areaId: [area.id],
              ...(seed.nativeRoleId
                ? { nativeRoleId: [seed.nativeRoleId] }
                : {}),
            },
          }),
        },
      );
      if (!upd.ok) {
        const body = await upd.text().catch(() => "");
        throw ApiError.serviceUnavailable(
          `update role ${seed.name}: ${upd.status} ${body.slice(0, 200)}`,
        );
      }
      results.push({ name: seed.name, action: "updated" });
    }

    return createSuccessResponse({
      areaId: area.id,
      seedCount: area.kcRoles.length,
      results,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
