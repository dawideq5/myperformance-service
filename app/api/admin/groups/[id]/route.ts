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

interface UpdatePayload {
  name?: string;
  description?: string;
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as UpdatePayload | null;
    const token = await keycloak.getServiceAccountToken();

    const current = await keycloak.adminRequest(`/groups/${id}`, token);
    if (!current.ok) throw ApiError.notFound("Group not found");
    const data = (await current.json()) as {
      id: string;
      name: string;
      attributes?: Record<string, string[]>;
    };
    const next: Record<string, unknown> = { id: data.id };
    next.name = body?.name?.trim() || data.name;
    const description = body?.description?.trim();
    const attrs: Record<string, string[]> = { ...(data.attributes ?? {}) };
    if (typeof description === "string") {
      if (description) attrs.description = [description];
      else delete attrs.description;
    }
    next.attributes = attrs;

    const res = await keycloak.adminRequest(`/groups/${id}`, token, {
      method: "PUT",
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to update group",
        res.status,
      );
    }
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const token = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(`/groups/${id}`, token, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to delete group",
        res.status,
      );
    }
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
