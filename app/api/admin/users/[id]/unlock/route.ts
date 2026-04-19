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

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const adminToken = await keycloak.getServiceAccountToken();
    const status = await keycloak.getBruteForceStatus(adminToken, id);

    return createSuccessResponse({
      numFailures: status?.numFailures ?? 0,
      disabled: status?.disabled ?? false,
      lastFailure: status?.lastFailure ?? null,
      lastIPFailure: status?.lastIPFailure ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const adminToken = await keycloak.getServiceAccountToken();
    await keycloak.clearBruteForce(adminToken, id);

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
