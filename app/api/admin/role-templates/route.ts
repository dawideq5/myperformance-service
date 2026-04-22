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
  createTemplate,
  listTemplates,
  type RoleTemplateAssignment,
} from "@/lib/role-templates";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const adminToken = await keycloak.getServiceAccountToken();
    const templates = await listTemplates(adminToken);
    return createSuccessResponse({ templates });
  } catch (err) {
    return handleApiError(err);
  }
}

interface CreateBody {
  name?: string;
  description?: string;
  icon?: string | null;
  areaRoles?: RoleTemplateAssignment[];
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body?.name?.trim()) throw ApiError.badRequest("Podaj nazwę");
    const adminToken = await keycloak.getServiceAccountToken();
    const tpl = await createTemplate(adminToken, {
      name: body.name,
      description: body.description,
      icon: body.icon ?? null,
      areaRoles: Array.isArray(body.areaRoles) ? body.areaRoles : [],
    });
    return createSuccessResponse({ template: tpl });
  } catch (err) {
    return handleApiError(err);
  }
}
