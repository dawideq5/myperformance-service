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
import { applyGroupResourcesForUser } from "@/lib/permissions/group-resources";

interface Ctx {
  params: Promise<{ id: string; userId: string }>;
}

/** Add user to group: PUT /users/{userId}/groups/{groupId} (idempotent). */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id, userId } = await params;
    const token = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(
      `/users/${userId}/groups/${id}`,
      token,
      { method: "PUT" },
    );
    if (!res.ok && res.status !== 204) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to add user to group",
        res.status,
        await res.text(),
      );
    }
    // Auto-grant: jeśli grupa ma mappingi w mp_group_resources, propaguj
    // membership do Documenso/Moodle/Chatwoot. Best-effort — błędy logujemy
    // (nie blokujemy operacji join). `req.headers.cookie` przekazujemy do
    // wewnętrznych route-ów żeby same widziały admin'a w session.
    const cookieHeader = req.headers.get("cookie") ?? undefined;
    const applyResults = await applyGroupResourcesForUser({
      groupId: id,
      userId,
      action: "add",
      cookieHeader,
    });
    return createSuccessResponse({ ok: true, applyResults });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Remove user from group. */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id, userId } = await params;
    // Auto-revoke PRZED faktycznym leave w KC, żeby native API miały pełen
    // kontekst (np. realm roles do walidacji).
    const cookieHeader = req.headers.get("cookie") ?? undefined;
    const applyResults = await applyGroupResourcesForUser({
      groupId: id,
      userId,
      action: "remove",
      cookieHeader,
    });
    const token = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(
      `/users/${userId}/groups/${id}`,
      token,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to remove user from group",
        res.status,
        await res.text(),
      );
    }
    return createSuccessResponse({ ok: true, applyResults });
  } catch (error) {
    return handleApiError(error);
  }
}
