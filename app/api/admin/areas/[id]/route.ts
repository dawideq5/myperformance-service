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
import { countUsersWithRole } from "@/lib/permissions/sync";
import { getProvider } from "@/lib/permissions/registry";
import type { NativePermission, NativeRole } from "@/lib/permissions/providers/types";

/**
 * GET /api/admin/areas/[id]
 *
 * Zwraca szczegóły area: wszystkie role (seed + custom prefix + native) i
 * listę permissions (live z providera, jeśli natywny).
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

async function listAreaKcRoles(
  adminToken: string,
  areaId: string,
  seedNames: string[],
): Promise<RoleRepresentation[]> {
  // Pobieramy wszystkie realm roles i filtrujemy po seed+prefix. KC nie
  // oferuje filtru po prefix, więc po prostu listujemy z max=500.
  const res = await keycloak.adminRequest(
    "/roles?briefRepresentation=false&max=500",
    adminToken,
  );
  if (!res.ok) {
    throw ApiError.serviceUnavailable("Nie udało się pobrać listy ról realm z Keycloak");
  }
  const all = (await res.json()) as RoleRepresentation[];
  const areaPrefix = `${areaId.replace(/-/g, "_")}_`;
  const seedSet = new Set(seedNames);
  return all.filter(
    (r) => seedSet.has(r.name) || r.name.startsWith(areaPrefix),
  );
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    const area = getArea(id);
    if (!area) throw ApiError.notFound(`Area ${id} nie istnieje`);

    const adminToken = await keycloak.getServiceAccountToken();
    const seedNames = area.kcRoles.map((r) => r.name);

    const [kcRoles, nativeRolesRaw, nativePermissions] = await Promise.all([
      listAreaKcRoles(adminToken, area.id, seedNames),
      area.provider === "native"
        ? getProvider(area.nativeProviderId)?.listRoles().catch(() => []) ?? []
        : Promise.resolve([] as NativeRole[]),
      area.provider === "native"
        ? getProvider(area.nativeProviderId)?.listPermissions().catch(() => []) ?? []
        : Promise.resolve([] as NativePermission[]),
    ]);

    // Policzmy userów per rola KC.
    const userCounts = await Promise.all(
      kcRoles.map((r) => countUsersWithRole(adminToken, r.name).catch(() => 0)),
    );
    const byRoleName = new Map<string, number>(
      kcRoles.map((r, i) => [r.name, userCounts[i]]),
    );

    // Zbuduj widok ujednolicony KC × native.
    const nativeById = new Map(nativeRolesRaw.map((r) => [r.id, r]));
    const roles = kcRoles.map((kc) => {
      const seed = area.kcRoles.find((s) => s.name === kc.name);
      const nativeIdAttr = kc.attributes?.nativeRoleId?.[0] ?? null;
      const nativeId = seed?.nativeRoleId ?? nativeIdAttr ?? null;
      const native = nativeId ? nativeById.get(nativeId) ?? null : null;
      return {
        kcRoleName: kc.name,
        kcRoleId: kc.id,
        description: kc.description ?? seed?.description ?? "",
        priority: seed?.priority ?? (isCustomRoleKcName(kc.name) ? 50 : 0),
        isSeeded: Boolean(seed),
        isCustom: isCustomRoleKcName(kc.name),
        userCount: byRoleName.get(kc.name) ?? 0,
        native: native
          ? {
              id: native.id,
              name: native.name,
              description: native.description ?? null,
              permissions: native.permissions,
              systemDefined: Boolean(native.systemDefined),
              userCount: native.userCount ?? null,
            }
          : null,
      };
    });

    // Role natywne nie mające jeszcze odpowiednika w KC (np. custom stworzone
    // bezpośrednio w Chatwoot/Directus) — wystawiamy osobną sekcją.
    const usedNativeIds = new Set(
      roles.map((r) => r.native?.id).filter((id): id is string => Boolean(id)),
    );
    const orphanNative = nativeRolesRaw
      .filter((r) => !usedNativeIds.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        permissions: r.permissions,
        systemDefined: Boolean(r.systemDefined),
        userCount: r.userCount ?? null,
      }));

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
        supportsCustomRoles:
          area.provider === "native"
            ? getProvider(area.nativeProviderId)?.supportsCustomRoles() ?? false
            : false,
      },
      roles,
      orphanNativeRoles: orphanNative,
      nativePermissions,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
