export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  CHATWOOT_PERMISSIONS,
  createCustomRole,
  isConfigured,
  listCustomRoles,
} from "@/lib/chatwoot";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    if (!isConfigured()) {
      return createSuccessResponse({
        configured: false,
        roles: [],
        permissions: CHATWOOT_PERMISSIONS,
      });
    }
    const roles = await listCustomRoles();
    return createSuccessResponse({
      configured: true,
      roles,
      permissions: CHATWOOT_PERMISSIONS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface CreatePayload {
  name?: string;
  description?: string;
  permissions?: string[];
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    if (!isConfigured()) {
      throw new ApiError("SERVICE_UNAVAILABLE", "Chatwoot not configured", 503);
    }
    const body = (await req.json().catch(() => null)) as CreatePayload | null;
    const name = body?.name?.trim();
    if (!name) throw ApiError.badRequest("Role name required");
    const allowed = new Set(CHATWOOT_PERMISSIONS.map((p) => p.key));
    const permissions = (body?.permissions ?? []).filter((p): p is string =>
      typeof p === "string" && allowed.has(p),
    );
    const role = await createCustomRole({
      name,
      description: body?.description?.trim() || undefined,
      permissions,
    });
    return createSuccessResponse({ role });
  } catch (error) {
    return handleApiError(error);
  }
}
