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

interface Ctx {
  params: Promise<{ id: string }>;
}

interface ReplacePayload {
  realmRoles?: string[];
}

/**
 * Replaces the full set of realm-role mappings on a group. The client
 * sends the target list; we diff against what Keycloak has and apply
 * only the delta, so the call is idempotent and cheap on big groups.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as ReplacePayload | null;
    // Akceptujemy dowolną realm role z KC (łącznie z dynamicznymi moodle_*)
    // — walidacja przez `byName` lookup poniżej (jeśli rola nie istnieje,
    // po prostu nie jest dodana, zero cichego fail).
    const target = new Set(
      (body?.realmRoles ?? []).filter((r) => typeof r === "string" && r.trim()),
    );

    const token = await keycloak.getServiceAccountToken();
    const [currentRes, allRolesRes] = await Promise.all([
      keycloak.adminRequest(`/groups/${id}/role-mappings/realm`, token),
      keycloak.adminRequest(
        "/roles?briefRepresentation=false",
        token,
      ),
    ]);
    if (!currentRes.ok) throw ApiError.notFound("Group not found");
    if (!allRolesRes.ok) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to list realm roles",
        allRolesRes.status,
      );
    }

    const current = (await currentRes.json()) as Array<{
      id: string;
      name: string;
    }>;
    const allRoles = (await allRolesRes.json()) as Array<{
      id: string;
      name: string;
    }>;
    const byName = new Map(allRoles.map((r) => [r.name, r]));

    const currentNames = new Set(current.map((r) => r.name));
    const toAdd: Array<{ id: string; name: string }> = [];
    const toRemove: Array<{ id: string; name: string }> = [];

    for (const name of target) {
      if (!currentNames.has(name)) {
        const r = byName.get(name);
        if (r) toAdd.push({ id: r.id, name: r.name });
      }
    }
    for (const r of current) {
      if (!target.has(r.name)) {
        toRemove.push({ id: r.id, name: r.name });
      }
    }

    if (toAdd.length > 0) {
      const addRes = await keycloak.adminRequest(
        `/groups/${id}/role-mappings/realm`,
        token,
        { method: "POST", body: JSON.stringify(toAdd) },
      );
      if (!addRes.ok) {
        throw new ApiError(
          "SERVICE_UNAVAILABLE",
          "Failed to add roles to group",
          addRes.status,
        );
      }
    }
    if (toRemove.length > 0) {
      const rmRes = await keycloak.adminRequest(
        `/groups/${id}/role-mappings/realm`,
        token,
        { method: "DELETE", body: JSON.stringify(toRemove) },
      );
      if (!rmRes.ok) {
        throw new ApiError(
          "SERVICE_UNAVAILABLE",
          "Failed to remove roles from group",
          rmRes.status,
        );
      }
    }

    return createSuccessResponse({
      ok: true,
      added: toAdd.map((r) => r.name),
      removed: toRemove.map((r) => r.name),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
