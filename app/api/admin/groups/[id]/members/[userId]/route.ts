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
  params: Promise<{ id: string; userId: string }>;
}

/** Add user to group: PUT /users/{userId}/groups/{groupId} (idempotent). */
export async function PUT(_req: Request, { params }: Ctx) {
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
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Remove user from group. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id, userId } = await params;
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
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
