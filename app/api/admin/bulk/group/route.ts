export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Payload {
  userIds: string[];
  groupId: string;
  /**
   * Jeśli true → user najpierw jest usuwany ze WSZYSTKICH innych grup
   * realmu, potem dodany do target. Enforce single-persona policy.
   * Default false (additive).
   */
  replace?: boolean;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const body = (await req.json().catch(() => null)) as Payload | null;
    const userIds = Array.isArray(body?.userIds)
      ? body.userIds.filter((s) => typeof s === "string" && s.trim())
      : [];
    const groupId = body?.groupId?.trim();
    const replace = body?.replace === true;

    if (!groupId) throw ApiError.badRequest("groupId is required");
    if (userIds.length === 0) throw ApiError.badRequest("userIds is required");

    const token = await keycloak.getServiceAccountToken();

    // Verify group exists up-front.
    const groupRes = await keycloak.adminRequest(`/groups/${groupId}`, token);
    if (!groupRes.ok) throw ApiError.notFound("Group not found");

    const results: Array<
      | { userId: string; status: "ok"; removedGroups: string[] }
      | { userId: string; status: "failed"; error: string }
    > = [];

    for (const userId of userIds) {
      try {
        const removedGroups: string[] = [];
        if (replace) {
          // Pobierz obecne grupy usera, usuń wszystkie inne.
          const currentRes = await keycloak.adminRequest(
            `/users/${userId}/groups?briefRepresentation=true`,
            token,
          );
          if (currentRes.ok) {
            const current = (await currentRes.json()) as Array<{ id: string; name: string }>;
            for (const g of current) {
              if (g.id === groupId) continue;
              const rm = await keycloak.adminRequest(
                `/users/${userId}/groups/${g.id}`,
                token,
                { method: "DELETE" },
              );
              if (rm.ok || rm.status === 204) {
                removedGroups.push(g.name);
              }
            }
          }
        }
        // Add to target group (idempotent w KC).
        const addRes = await keycloak.adminRequest(
          `/users/${userId}/groups/${groupId}`,
          token,
          { method: "PUT" },
        );
        if (!addRes.ok && addRes.status !== 204) {
          results.push({
            userId,
            status: "failed",
            error: `KC PUT /users/${userId}/groups/${groupId} returned ${addRes.status}`,
          });
          continue;
        }
        results.push({ userId, status: "ok", removedGroups });
      } catch (err) {
        results.push({
          userId,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const ok = results.filter((r) => r.status === "ok").length;
    const failed = results.length - ok;

    return createSuccessResponse({
      total: results.length,
      ok,
      failed,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
