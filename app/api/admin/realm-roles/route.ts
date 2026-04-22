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

interface CreatePayload {
  name?: string;
  description?: string;
}

/**
 * Create a brand-new realm role in Keycloak. Only exposed to admins —
 * used from the permissions tree when the existing catalog doesn't cover
 * what a customer needs (e.g. a new operational permission gate). The
 * role appears in the "Inne role" bucket until someone extends
 * SERVICE_GROUPS in api/admin/roles/tree.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as CreatePayload | null;
    const name = body?.name?.trim();
    if (!name) throw ApiError.badRequest("Role name required");
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw ApiError.badRequest(
        "Role name must use snake_case letters/digits",
      );
    }
    const description = body?.description?.trim() || name;

    const token = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest("/roles", token, {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
    if (res.status === 409) {
      throw ApiError.conflict("Role with that name already exists");
    }
    if (!res.ok) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to create realm role",
        res.status,
      );
    }
    return createSuccessResponse({ name, description });
  } catch (error) {
    return handleApiError(error);
  }
}
