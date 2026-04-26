export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import {
  getDeviceIntel,
  listDeviceOverview,
  listDevicesForUser,
} from "@/lib/security/devices";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

/**
 * GET /api/admin/security/devices
 *   ?deviceId=...  → szczegóły jednego urządzenia (users + IPs + flagi)
 *   ?userId=...    → wszystkie urządzenia użytkownika
 *   bez parametrów → overview: top devices + suspicious correlations
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);

    const url = new URL(req.url);
    const deviceId = url.searchParams.get("deviceId");
    const userId = url.searchParams.get("userId");
    const hours = parseInt(url.searchParams.get("hours") ?? "168", 10);

    if (deviceId) {
      const intel = await getDeviceIntel(deviceId);
      if (!intel) {
        return createSuccessResponse({ device: null });
      }
      return createSuccessResponse({ device: intel });
    }

    if (userId) {
      const devices = await listDevicesForUser(userId);
      return createSuccessResponse({ devices });
    }

    const overview = await listDeviceOverview({
      hours: Number.isFinite(hours) ? hours : 168,
    });
    return createSuccessResponse(overview);
  } catch (error) {
    return handleApiError(error);
  }
}
