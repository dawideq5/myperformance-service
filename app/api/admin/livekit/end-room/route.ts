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
import { LiveKitNotConfiguredError, deleteRoom } from "@/lib/livekit";
import { log } from "@/lib/logger";

const logger = log.child({ module: "admin-livekit-end-room" });

/**
 * POST /api/admin/livekit/end-room   (Wave 23)
 *
 * Force-end any room — admin oversight. Wykorzystuje LiveKit
 * RoomService.deleteRoom; webhook room_finished zaktualizuje row w
 * mp_livekit_sessions na ended (z duration).
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

    try {
      await deleteRoom(roomName);
    } catch (err) {
      if (err instanceof LiveKitNotConfiguredError) {
        throw new ApiError(
          "SERVICE_UNAVAILABLE",
          "LiveKit not configured",
          503,
        );
      }
      logger.error("deleteRoom failed", {
        roomName,
        err: err instanceof Error ? err.message : String(err),
      });
      throw new ApiError("INTERNAL_ERROR", "Nie udało się zakończyć pokoju.", 502);
    }

    logger.info("admin force-ended room", {
      roomName,
      adminEmail: session?.user?.email,
    });

    return createSuccessResponse({ ok: true, roomName });
  } catch (err) {
    return handleApiError(err);
  }
}
