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
import { customRoleKcName, getArea } from "@/lib/permissions/areas";
import { getProvider } from "@/lib/permissions/registry";
import { ensureCustomAreaRole } from "@/lib/permissions/sync";
import { ProviderUnsupportedError } from "@/lib/permissions/providers/types";

/**
 * POST /api/admin/areas/[id]/roles
 *
 * Tworzy nową rolę w area. Jeśli provider natywny → najpierw powołuje
 * natywną rolę (z permissions), potem KC rolę (`<area>_custom_<slug>`)
 * z attribute `nativeRoleId`.
 *
 * Dla area `keycloak-only` → same KC role (bez permissions), attr areaId.
 */
interface Ctx {
  params: Promise<{ id: string }>;
}

interface CreatePayload {
  name?: string;
  description?: string;
  permissions?: string[];
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    const area = getArea(id);
    if (!area) throw ApiError.notFound(`Area ${id} nie istnieje`);

    const body = (await req.json().catch(() => null)) as CreatePayload | null;
    const name = body?.name?.trim();
    if (!name) throw ApiError.badRequest("Brak nazwy roli");
    const description = body?.description?.trim() ?? "";
    const permissions = Array.isArray(body?.permissions) ? body.permissions : [];

    const adminToken = await keycloak.getServiceAccountToken();
    const kcRoleName = customRoleKcName(area.id, name);

    let nativeRoleId: string | undefined;

    if (area.provider === "native") {
      const provider = getProvider(area.nativeProviderId);
      if (!provider) {
        throw ApiError.badRequest(
          `Provider natywny ${area.nativeProviderId} nie jest zarejestrowany`,
        );
      }
      if (!provider.isConfigured()) {
        throw ApiError.serviceUnavailable(
          `Provider ${area.nativeProviderId} nie jest skonfigurowany (brak envów)`,
        );
      }
      if (!provider.supportsCustomRoles()) {
        throw ApiError.badRequest(
          `Area ${area.id} nie wspiera custom ról w Phase 1`,
        );
      }
      try {
        const native = await provider.createRole({
          name,
          description,
          permissions,
        });
        nativeRoleId = native.id;
      } catch (err) {
        if (err instanceof ProviderUnsupportedError) {
          throw ApiError.badRequest(err.message);
        }
        throw err;
      }
    }

    const role = await ensureCustomAreaRole(
      adminToken,
      area.id,
      kcRoleName,
      description || `Custom ${area.label}: ${name}`,
      nativeRoleId,
    );

    return createSuccessResponse({
      role: {
        kcRoleName: role.name,
        kcRoleId: role.id,
        nativeRoleId: nativeRoleId ?? null,
        description,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
