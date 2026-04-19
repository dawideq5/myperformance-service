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

interface Payload {
  password?: string;
  temporary?: boolean;
  sendEmail?: boolean;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const body = (await req.json().catch(() => null)) as Payload | null;
    const adminToken = await keycloak.getServiceAccountToken();

    if (body?.sendEmail !== false && !body?.password) {
      await keycloak.executeActionsEmail(
        adminToken,
        id,
        ["UPDATE_PASSWORD"],
        { lifespan: 60 * 60 * 24 },
      );
      return createSuccessResponse({ sent: true });
    }

    const password = body?.password?.trim();
    if (!password || password.length < 8) {
      throw ApiError.badRequest(
        "Password required (min. 8 chars) when sendEmail=false",
      );
    }

    const res = await keycloak.adminRequest(
      `/users/${id}/reset-password`,
      adminToken,
      {
        method: "PUT",
        body: JSON.stringify({
          type: "password",
          value: password,
          temporary: body?.temporary !== false,
        }),
      },
    );

    if (!res.ok) {
      const details = await res.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to reset password",
        res.status,
        details,
      );
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
