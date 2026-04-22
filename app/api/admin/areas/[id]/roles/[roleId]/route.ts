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
import { getArea, isCustomRoleKcName } from "@/lib/permissions/areas";
import { getProvider } from "@/lib/permissions/registry";
import { deleteCustomAreaRole } from "@/lib/permissions/sync";
import { ProviderUnsupportedError } from "@/lib/permissions/providers/types";

/**
 * PATCH/DELETE /api/admin/areas/[id]/roles/[roleId]
 *
 * Parametr `roleId` to nazwa roli KC (np. `chatwoot_custom_support`).
 */
interface Ctx {
  params: Promise<{ id: string; roleId: string }>;
}

interface PatchPayload {
  description?: string;
  permissions?: string[];
  name?: string;
}

async function getKcRole(adminToken: string, roleName: string) {
  const res = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(roleName)}`,
    adminToken,
  );
  if (!res.ok) {
    if (res.status === 404) throw ApiError.notFound("Rola KC nie istnieje");
    throw ApiError.serviceUnavailable("Błąd pobierania roli z Keycloak");
  }
  return (await res.json()) as {
    id: string;
    name: string;
    description?: string;
    attributes?: Record<string, string[]>;
  };
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id, roleId } = await params;
    const area = getArea(id);
    if (!area) throw ApiError.notFound(`Area ${id} nie istnieje`);

    const body = (await req.json().catch(() => null)) as PatchPayload | null;
    if (!body) throw ApiError.badRequest("Pusty request body");

    const adminToken = await keycloak.getServiceAccountToken();
    const kcRole = await getKcRole(adminToken, roleId);

    const isSeed = area.kcRoles.some((r) => r.name === roleId);

    // Seed roles są "read-only" w KC — ale można updatować native (jeśli nie
    // systemDefined). Custom area roles pozwalamy edytować pełniej.

    const nativeRoleId =
      area.kcRoles.find((r) => r.name === roleId)?.nativeRoleId ??
      kcRole.attributes?.nativeRoleId?.[0] ??
      null;

    if (area.provider === "native" && nativeRoleId) {
      const provider = getProvider(area.nativeProviderId);
      if (provider?.isConfigured()) {
        try {
          await provider.updateRole(nativeRoleId, {
            name: body.name,
            description: body.description,
            permissions: body.permissions,
          });
        } catch (err) {
          if (err instanceof ProviderUnsupportedError) {
            // Ignorujemy dla prowiderów read-only (np. Moodle Phase 1).
          } else {
            throw err;
          }
        }
      }
    }

    if (isCustomRoleKcName(roleId) && (body.description !== undefined)) {
      await keycloak.adminRequest(`/roles-by-id/${kcRole.id}`, adminToken, {
        method: "PUT",
        body: JSON.stringify({
          ...kcRole,
          description: body.description,
        }),
      });
    }

    return createSuccessResponse({ ok: true, isSeed });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id, roleId } = await params;
    const area = getArea(id);
    if (!area) throw ApiError.notFound(`Area ${id} nie istnieje`);

    if (area.kcRoles.some((r) => r.name === roleId)) {
      throw ApiError.badRequest("Nie można usunąć roli seed area");
    }
    if (!isCustomRoleKcName(roleId)) {
      throw ApiError.badRequest(
        "Rola nie jest rolą custom area (prefix `<area>_custom_*`)",
      );
    }

    const adminToken = await keycloak.getServiceAccountToken();
    const kcRole = await getKcRole(adminToken, roleId);

    const nativeRoleId = kcRole.attributes?.nativeRoleId?.[0] ?? null;

    if (area.provider === "native" && nativeRoleId) {
      const provider = getProvider(area.nativeProviderId);
      if (provider?.isConfigured()) {
        try {
          await provider.deleteRole(nativeRoleId);
        } catch (err) {
          if (err instanceof ProviderUnsupportedError) {
            // skip
          } else {
            throw err;
          }
        }
      }
    }

    await deleteCustomAreaRole(roleId);
    return createSuccessResponse({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
