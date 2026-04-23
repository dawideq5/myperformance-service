export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    return createSuccessResponse({
      deprecated: true,
      message: "In-app user management has been removed. Manage users directly in Keycloak Admin Console.",
      target: "/admin/keycloak",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    throw new ApiError(
      "BAD_REQUEST",
      "In-app user provisioning has been removed. Create users directly in Keycloak Admin Console.",
      410,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
