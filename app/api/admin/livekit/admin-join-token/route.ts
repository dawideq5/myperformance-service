export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import {
  LiveKitNotConfiguredError,
  buildJoinUrl,
  signJoinToken,
} from "@/lib/livekit";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "admin-livekit-join" });

const APP_BASE =
  getOptionalEnv("NEXT_PUBLIC_APP_URL").trim().replace(/\/$/, "") ||
  "https://myperformance.pl";

/**
 * POST /api/admin/livekit/admin-join-token  (Wave 23)
 *
 * Wystawia signed join token dla admina, który chce zajrzeć do active
 * room (oversight). Identity = `Admin (<email>)` — widoczne w
 * participant list. Zwraca `joinUrl` który admin otwiera w nowej karcie.
 *
 * Body: { roomName: string }
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);

    const body = (await req.json().catch(() => null)) as {
      roomName?: unknown;
    } | null;
    const roomName =
      typeof body?.roomName === "string" ? body.roomName.trim() : "";
    if (!roomName) {
      throw ApiError.badRequest("roomName required");
    }

    const adminEmail = session?.user?.email ?? "admin";
    const identity = `Admin (${adminEmail})`;

    let joinToken: string;
    try {
      joinToken = await signJoinToken({
        roomName,
        identity,
        ttlSec: 30 * 60,
      });
    } catch (err) {
      if (err instanceof LiveKitNotConfiguredError) {
        throw new ApiError(
          "SERVICE_UNAVAILABLE",
          "LiveKit not configured",
          503,
        );
      }
      throw err;
    }

    const joinUrl = buildJoinUrl(APP_BASE, roomName, joinToken);

    logger.info("admin join token issued", {
      roomName,
      adminEmail,
    });

    return createSuccessResponse({ joinUrl, roomName, ttlSec: 30 * 60 });
  } catch (err) {
    return handleApiError(err);
  }
}
