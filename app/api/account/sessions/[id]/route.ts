import { getServerSession } from "next-auth/next";
import { NextRequest } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  fetchWithTimeout,
} from "@/lib/api-utils";

/**
 * DELETE /api/account/sessions/{id}
 *
 * Terminates a specific session by ID.
 * First tries Account API, falls back to Admin API on 401.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      throw ApiError.unauthorized();
    }

    const { id } = await params;

    if (!id) {
      throw ApiError.badRequest("Missing session ID");
    }

    // Try Account API first
    let response = await fetchWithTimeout(
      keycloak.getAccountUrl(`/account/sessions/${id}`),
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
      },
      10000 // 10s timeout
    );

    // Fallback to Admin API on 401
    if (response.status === 401) {
      console.log("[Sessions] Account API unauthorized for delete, falling back to Admin API");
      const adminToken = await keycloak.getServiceAccountToken();

      response = await fetchWithTimeout(
        keycloak.getAdminUrl(`/sessions/${id}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            Accept: "application/json",
          },
        },
        10000
      );
    }

    if (!response.ok) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to logout session",
        response.status
      );
    }

    return createSuccessResponse({ id, terminated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
