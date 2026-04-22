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
  deleteCustomRole,
  updateCustomRole,
} from "@/lib/chatwoot";

interface Ctx {
  params: Promise<{ id: string }>;
}

interface UpdatePayload {
  name?: string;
  description?: string;
  permissions?: string[];
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) throw ApiError.badRequest("Invalid role id");
    const body = (await req.json().catch(() => null)) as UpdatePayload | null;
    const allowed = new Set(CHATWOOT_PERMISSIONS.map((p) => p.key));
    const permissions = Array.isArray(body?.permissions)
      ? body.permissions.filter((p): p is string => typeof p === "string" && allowed.has(p))
      : undefined;
    const role = await updateCustomRole(numericId, {
      name: body?.name?.trim(),
      description: body?.description?.trim(),
      permissions,
    });
    return createSuccessResponse({ role });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) throw ApiError.badRequest("Invalid role id");
    await deleteCustomRole(numericId);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
