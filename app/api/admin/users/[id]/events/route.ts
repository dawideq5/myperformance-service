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

/**
 * GET /api/admin/users/[id]/events?max=50
 *
 * Zwraca ostatnie zdarzenia Keycloak dla danego usera — login, logout,
 * refresh, update_profile, update_password, send_verify_email,
 * send_reset_password, remove_totp, rejestracja passkey itd.
 *
 * Łączy dwa źródła KC:
 *  - /events — user events (login, logout, refresh, …)
 *  - /admin-events — admin actions scoped to user resource (updates,
 *    password resets przez admin UI, assignment ról)
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const url = new URL(req.url);
    const max = Math.max(
      1,
      Math.min(200, Number(url.searchParams.get("max") ?? "50") || 50),
    );

    const adminToken = await keycloak.getServiceAccountToken();

    const [userEventsRes, adminEventsRes] = await Promise.all([
      keycloak.adminRequest(
        `/events?user=${encodeURIComponent(id)}&max=${max}`,
        adminToken,
      ),
      keycloak.adminRequest(
        `/admin-events?resourcePath=${encodeURIComponent(
          `users/${id}`,
        )}&max=${max}`,
        adminToken,
      ),
    ]);

    const userEvents = userEventsRes.ok ? await userEventsRes.json() : [];
    const adminEvents = adminEventsRes.ok ? await adminEventsRes.json() : [];

    interface KeycloakUserEvent {
      type?: string;
      time?: number;
      clientId?: string;
      ipAddress?: string;
      error?: string;
      details?: Record<string, unknown>;
    }
    interface KeycloakAdminEvent {
      operationType?: string;
      resourceType?: string;
      resourcePath?: string;
      time?: number;
      authDetails?: { ipAddress?: string };
      error?: string;
      representation?: unknown;
    }

    const events = [
      ...(Array.isArray(userEvents) ? (userEvents as KeycloakUserEvent[]) : []).map((e) => ({
        kind: "user" as const,
        type: e.type,
        time: e.time,
        clientId: e.clientId ?? null,
        ipAddress: e.ipAddress ?? null,
        error: e.error ?? null,
        details: e.details ?? {},
      })),
      ...(Array.isArray(adminEvents) ? (adminEvents as KeycloakAdminEvent[]) : []).map((e) => ({
        kind: "admin" as const,
        type: e.operationType ? `${e.operationType}_${e.resourceType}` : "admin",
        time: e.time,
        clientId: null,
        ipAddress: e.authDetails?.ipAddress ?? null,
        error: e.error ?? null,
        details: {
          operation: e.operationType,
          resource: e.resourceType,
          path: e.resourcePath,
          representation: e.representation,
        },
      })),
    ].sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

    return createSuccessResponse({ events: events.slice(0, max) });
  } catch (error) {
    return handleApiError(error);
  }
}
