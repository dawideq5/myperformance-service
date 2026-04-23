export const dynamic = "force-dynamic";

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

    const accountUrl = keycloak.getAccountUrl("/account/sessions");
    let response = await fetchWithTimeout(
      accountUrl,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
      },
      10000
    );

    let sessions = [];

    if (response.ok) {
      sessions = await response.json();
    } else {
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
        throw new ApiError("SERVICE_UNAVAILABLE", "Failed to fetch sessions", response.status, errorText);
      }
      sessions = await response.json();
    }

    const sid = session.user?.sid || session.user?.session_id;

    interface KeycloakSessionRaw {
      id?: string;
      ipAddress?: string;
      start?: number | string;
      started?: number | string;
      lastAccess?: number | string;
      expires?: number | string;
      browser?: string;
      os?: string;
      device?: string;
      clients?: Record<string, string>;
    }

    const flatSessions: SessionInfo[] = (sessions as KeycloakSessionRaw[]).map((s) => {
      // Keycloak timestamps can be in ms (e.g. 1713436000000) or s (e.g. 1713436000)
      const toSec = (ts: number | string | undefined) => {
        if (!ts) return 0;
        const n = Number(ts);
        if (isNaN(n)) return 0;
        // If it's larger than 10^11, it's definitely milliseconds
        return n > 100000000000 ? Math.floor(n / 1000) : n;
      };

      const lastAccess = toSec(s.lastAccess);
      const started = toSec(s.start || s.started);
      
      // Calculate expires: either from API or lastAccess + 10 hours (36000 seconds)
      let expires = toSec(s.expires);
      if (!expires && lastAccess) {
        expires = lastAccess + 36000;
      }

      const isCurrent = s.id === sid;

      return {
        id: s.id ?? "",
        ipAddress: s.ipAddress || "Unknown",
        started,
        lastAccess,
        expires,
        browser: s.browser || (s.ipAddress ? `Session from ${s.ipAddress}` : "Unknown Browser"),
        os: s.os || "Unknown OS",
        device: s.device || "Unknown Device",
        current: isCurrent,
      };
    });

    return createSuccessResponse(flatSessions);
  } catch (error) {
    console.error("[sessions] Error:", error);
    return handleApiError(error);
  }
}
