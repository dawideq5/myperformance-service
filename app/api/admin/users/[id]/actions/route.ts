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

interface ActionPayload {
  actions: string[];
  sendEmail?: boolean;
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    if (!action) throw ApiError.badRequest("action query param required");

    const adminToken = await keycloak.getServiceAccountToken();
    await keycloak.removeUserRequiredAction(adminToken, id, action);
    return createSuccessResponse({ removed: action });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const body = (await req.json().catch(() => null)) as ActionPayload | null;
    const actions = Array.isArray(body?.actions) ? body.actions : [];
    if (actions.length === 0) {
      throw ApiError.badRequest("actions array required");
    }

    const adminToken = await keycloak.getServiceAccountToken();

    if (body?.sendEmail !== false) {
      await keycloak.executeActionsEmail(adminToken, id, actions, {
        lifespan: 60 * 60 * 24 * 7,
      });
      return createSuccessResponse({ sent: true });
    }

    for (const action of actions) {
      await keycloak.appendUserRequiredAction(adminToken, id, action);
    }
    return createSuccessResponse({ sent: false, queued: true });
  } catch (error) {
    return handleApiError(error);
  }
}
