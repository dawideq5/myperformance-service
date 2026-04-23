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
import { getProvider } from "@/lib/permissions/registry";

interface Ctx {
  params: Promise<{ id: string }>;
}

interface CreatePayload {
  slug?: string;
  description?: string;
  /**
   * Permissions dla natywnej aplikacji (np. Chatwoot custom role). Dla
   * providerów, którzy nie wspierają custom ról (Documenso, Postal, Outline,
   * Moodle, itd.) — musi być puste, albo zostanie zignorowane.
   */
  permissions?: string[];
  /**
   * Już istniejąca rola w natywnym systemie — jeśli admin chce zmapować
   * KC role na istniejącą rolę Chatwoot/Directus, nie tworząc nowej.
   */
  nativeRoleId?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * POST /api/admin/areas/[id]/roles
 *
 * Tworzy nową "rolę" w obrębie area — to jest metarola widziana przez panel
 * IAM. Zawsze powstaje realm role w KC (prefix `<area>_custom_<slug>`), a
 * dla obszarów natywnych z custom-role support tworzymy też rekord w
 * aplikacji natywnej. Id natywnej roli trafia do attribute `nativeRoleId`
 * KC role, który przy przypisywaniu usera trigger-uje sync.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    const area = getArea(id);
    if (!area) throw ApiError.notFound(`Area ${id} nie istnieje`);

    const body = (await req.json().catch(() => null)) as CreatePayload | null;
    if (!body) throw ApiError.badRequest("Invalid body");

    const rawSlug = body.slug?.trim();
    if (!rawSlug) throw ApiError.badRequest("slug required");
    const slug = slugify(rawSlug);
    if (!slug) throw ApiError.badRequest("slug must produce snake_case chars");

    const areaSnake = area.id.replace(/-/g, "_");
    const kcName = `${areaSnake}_custom_${slug}`;
    const description = body.description?.trim() || rawSlug;

    const adminToken = await keycloak.getServiceAccountToken();

    // 1) Jeśli area ma natywnego providera, optional: utwórz rolę w aplikacji
    let nativeRoleId: string | null = null;
    if (area.provider === "native") {
      const provider = getProvider(area.nativeProviderId);
      if (provider?.isConfigured()) {
        if (body.nativeRoleId) {
          // Wskazana istniejąca rola natywna — tylko walidacja, że istnieje.
          const list = await provider.listRoles();
          if (!list.find((r) => r.id === body.nativeRoleId)) {
            throw ApiError.badRequest(
              `Role ${body.nativeRoleId} nie istnieje w ${area.nativeProviderId}`,
            );
          }
          nativeRoleId = body.nativeRoleId;
        } else if (provider.supportsCustomRoles()) {
          const created = await provider.createRole({
            name: rawSlug,
            description,
            permissions: body.permissions ?? [],
          });
          nativeRoleId = created.id;
        }
      }
    }

    // 2) Utwórz realm role w KC z attributes.nativeRoleId
    const kcRes = await keycloak.adminRequest("/roles", adminToken, {
      method: "POST",
      body: JSON.stringify({
        name: kcName,
        description,
        attributes: nativeRoleId
          ? { nativeRoleId: [nativeRoleId] }
          : {},
      }),
    });
    if (kcRes.status === 409) {
      throw ApiError.conflict(`Rola ${kcName} już istnieje`);
    }
    if (!kcRes.ok) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Nie udało się utworzyć roli w Keycloak",
        kcRes.status,
      );
    }

    return createSuccessResponse({
      kcRoleName: kcName,
      nativeRoleId,
      description,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * DELETE /api/admin/areas/[id]/roles?name=<kcName>
 *
 * Usuwa custom role z KC i odpowiadającą rolę natywną (jeśli istnieje i
 * nie jest systemowa).
 */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    const area = getArea(id);
    if (!area) throw ApiError.notFound(`Area ${id} nie istnieje`);

    const url = new URL(req.url);
    const kcName = url.searchParams.get("name");
    if (!kcName) throw ApiError.badRequest("name required");

    const areaSnake = area.id.replace(/-/g, "_");
    if (!kcName.startsWith(`${areaSnake}_custom_`)) {
      throw ApiError.badRequest(
        "Można usuwać tylko role custom (prefix <area>_custom_)",
      );
    }

    const adminToken = await keycloak.getServiceAccountToken();

    // 1) Pobierz KC role aby wyciągnąć nativeRoleId.
    const roleRes = await keycloak.adminRequest(
      `/roles/${encodeURIComponent(kcName)}`,
      adminToken,
    );
    if (roleRes.ok) {
      const role = await roleRes.json();
      const nativeRoleId: string | undefined =
        role.attributes?.nativeRoleId?.[0];
      if (nativeRoleId && area.provider === "native") {
        const provider = getProvider(area.nativeProviderId);
        if (provider?.isConfigured() && provider.supportsCustomRoles()) {
          try {
            await provider.deleteRole(nativeRoleId);
          } catch (err) {
            console.error(
              `[areas/${id}/roles] native delete failed:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    }

    // 2) Delete z KC. 404 OK (idempotent).
    const del = await keycloak.adminRequest(
      `/roles/${encodeURIComponent(kcName)}`,
      adminToken,
      { method: "DELETE" },
    );
    if (!del.ok && del.status !== 404) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Nie udało się usunąć roli z Keycloak",
        del.status,
      );
    }

    return createSuccessResponse({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
