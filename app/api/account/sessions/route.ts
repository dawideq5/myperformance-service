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
  current: boolean;
}

/**
 * GET /api/account/sessions
 *
 * Returns active sessions for the current user.
 * First tries Keycloak Account API, falls back to Admin API if unauthorized.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      throw ApiError.unauthorized();
    }

    // Try Account API first (user's own token)
    // Note: Account API requires 'account' scope which is not requested (Keycloak doesn't support it)
    // We expect 401 and fall back to Admin API
    let response = await fetchWithTimeout(
      keycloak.getAccountUrl("/account/sessions/devices"),
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
      },
      10000 // 10s timeout
    );

    // If Account API returns 401 (expected without 'account' scope), fall back to Admin API
    if (response.status === 401) {
      const userId = await keycloak.getUserIdFromToken(session.accessToken);
      const adminToken = await keycloak.getServiceAccountToken();

      response = await fetchWithTimeout(
        keycloak.getAdminUrl(`/users/${userId}/sessions`),
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            Accept: "application/json",
          },
        },
        10000
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          "SERVICE_UNAVAILABLE",
          "Failed to fetch sessions",
          response.status,
          errorText
        );
      }

      const sessions = await response.json();
      // Transform Admin API format to SessionInfo format
      const flatSessions: SessionInfo[] = sessions.map((s: any) => ({
        id: s.id,
        ipAddress: s.ipAddress || "Unknown",
        started: s.started || 0,
        lastAccess: s.lastAccess || 0,
        expires: s.lastAccess + 28800000, // Approximate: 8h session
        browser: `${s.browser || "Unknown"} / ${s.operatingSystem || "Unknown"}`,
        current: false, // Cannot determine from Admin API
      }));

      return createSuccessResponse(flatSessions);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to fetch sessions",
        response.status,
        errorText
      );
    }

    const data = await response.json();

    // Flatten device sessions into a simple list
    const flatSessions: SessionInfo[] = [];
    if (Array.isArray(data)) {
      for (const device of data) {
        if (device.sessions && Array.isArray(device.sessions)) {
          for (const s of device.sessions) {
            flatSessions.push({
              id: s.id,
              ipAddress: s.ipAddress || "Unknown",
              started: s.started || 0,
              lastAccess: s.lastAccess || 0,
              expires: s.expires || 0,
              browser: `${s.browser || "Unknown"} / ${device.os || "Unknown"}`,
              current: s.current || false,
            });
          }
        }
      }
    }

    return createSuccessResponse(flatSessions);
  } catch (error) {
    return handleApiError(error);
  }
}
