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

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const adminToken = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(
      `/users/${id}/sessions`,
      adminToken,
    );

    if (!res.ok) {
      const details = await res.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to fetch user sessions",
        res.status,
        details,
      );
    }

    interface RawKeycloakSession {
      id?: string;
      ipAddress?: string;
      start?: number | string;
      started?: number | string;
      lastAccess?: number | string;
      expires?: number | string;
      clients?: Record<string, string>;
    }
    const raw = (await res.json()) as RawKeycloakSession[];
    const toSec = (ts: number | string | undefined) => {
      if (!ts) return 0;
      const n = Number(ts);
      if (Number.isNaN(n)) return 0;
      return n > 100000000000 ? Math.floor(n / 1000) : n;
    };

    const sessions = raw.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress || "Unknown",
      started: toSec(s.start || s.started),
      lastAccess: toSec(s.lastAccess),
      expires: toSec(s.expires),
      clients: s.clients ?? {},
    }));

    return createSuccessResponse({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const adminToken = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(`/users/${id}/logout`, adminToken, {
      method: "POST",
    });

    if (!res.ok) {
      const details = await res.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to terminate sessions",
        res.status,
        details,
      );
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
