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
import {
  deleteTemplate,
  getTemplate,
  updateTemplate,
  type RoleTemplateAssignment,
} from "@/lib/role-templates";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const adminToken = await keycloak.getServiceAccountToken();
    const tpl = await getTemplate(adminToken, id);
    if (!tpl) throw ApiError.notFound("Template nie istnieje");
    return createSuccessResponse({ template: tpl });
  } catch (err) {
    return handleApiError(err);
  }
}

interface PatchBody {
  name?: string;
  description?: string;
  icon?: string | null;
  areaRoles?: RoleTemplateAssignment[];
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body) throw ApiError.badRequest("Pusty body");
    const adminToken = await keycloak.getServiceAccountToken();
    const tpl = await updateTemplate(adminToken, id, body);
    return createSuccessResponse({ template: tpl });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const adminToken = await keycloak.getServiceAccountToken();
    await deleteTemplate(adminToken, id);
    return createSuccessResponse({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
