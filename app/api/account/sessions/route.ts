import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  fetchWithTimeout,
} from "@/lib/api-utils";

export interface SessionInfo {
  id: string;
  ipAddress: string;
  started: number;
  lastAccess: number;
  expires: number;
  browser: string;
  os?: string;
  device?: string;
  current: boolean;
}

/**
 * GET /api/account/sessions
 *
 * Returns active sessions for the current user using Keycloak Admin API.
 * Admin API provides basic session information (ipAddress, start, lastAccess).
 * Note: Account API with device/browser/OS info requires 'account' scope which is not available.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      throw ApiError.unauthorized();
    }

    console.log("[sessions] Fetching user sessions...");

    // Use Keycloak Admin API for user sessions
    // Note: Admin API does not provide browser/OS info, only basic session data
    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    console.log("[sessions] User ID:", userId);

    const adminToken = await keycloak.getServiceAccountToken();
    console.log("[sessions] Got admin token");

    const response = await fetchWithTimeout(
      keycloak.getAdminUrl(`/users/${userId}/sessions`),
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Accept: "application/json",
        },
      },
      10000 // 10s timeout
    );

    console.log("[sessions] Admin API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[sessions] Admin API error:", errorText);
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to fetch sessions",
        response.status,
        errorText
      );
    }

    const sessions = await response.json();
    console.log("[sessions] Keycloak Admin API response:", JSON.stringify(sessions, null, 2));

    // Transform Admin API format to SessionInfo format
    const flatSessions: SessionInfo[] = sessions.map((s: any) => ({
      id: s.id,
      ipAddress: s.ipAddress || "Unknown",
      started: s.start || 0,
      lastAccess: s.lastAccess || 0,
      expires: s.lastAccess ? s.lastAccess + 28800000 : 0, // Approximate: 8h session
      browser: `Session from ${s.ipAddress || "Unknown IP"}`,
      os: "Unknown",
      device: "Unknown",
      current: false, // Cannot determine from Admin API
    }));

    console.log("[sessions] Transformed sessions:", JSON.stringify(flatSessions, null, 2));

    return createSuccessResponse(flatSessions);
  } catch (error) {
    console.error("[sessions] Error:", error);
    return handleApiError(error);
  }
}
