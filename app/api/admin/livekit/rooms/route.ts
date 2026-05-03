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
import { LiveKitNotConfiguredError, listAllRooms } from "@/lib/livekit";
import { listActiveSessions, type LiveKitSession } from "@/lib/livekit-rooms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "admin-livekit-rooms" });

/**
 * GET /api/admin/livekit/rooms
 *
 * Wave 23 — admin oversight. Łączymy DB sessions (ground truth dla
 * lifecycle: kto rozpoczął, kiedy, dla jakiego ticketu) z live LiveKit
 * server (ile uczestników w pokoju TERAZ). LiveKit może być nieosiągalny
 * (env nieskonfigurowany) — wtedy zwracamy same DB sessions.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);

    const sessions: LiveKitSession[] = await listActiveSessions();

    let liveParticipants: Map<string, number> = new Map();
    let liveKitReachable = false;
    try {
      const rooms = await listAllRooms();
      liveKitReachable = true;
      for (const r of rooms) {
        liveParticipants.set(r.name, r.numParticipants ?? 0);
      }
    } catch (err) {
      if (err instanceof LiveKitNotConfiguredError) {
        // Expected in dev without LiveKit env — return DB-only data.
        logger.info("LiveKit not configured — returning DB sessions only");
      } else {
        logger.warn("listRooms failed (continuing DB-only)", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const enriched = sessions.map((s) => ({
      ...s,
      liveParticipants: liveParticipants.get(s.roomName) ?? null,
    }));

    return createSuccessResponse({
      rooms: enriched,
      liveKitReachable,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return handleApiError(err);
    }
    return handleApiError(err);
  }
}
