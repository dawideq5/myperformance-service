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
import { syncNativeProvidersFromKcRoles } from "@/lib/permissions/sync";
import { log } from "@/lib/logger";

const logger = log.child({ module: "admin-user-groups" });

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const token = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(`/users/${id}/groups`, token);
    if (!res.ok) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to fetch user groups",
        res.status,
      );
    }
    const raw = (await res.json()) as Array<{ id: string; name: string }>;
    return createSuccessResponse({
      groups: raw.map((g) => ({ id: g.id, name: g.name })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface Payload {
  join?: string[];
  leave?: string[];
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Payload | null;
    const join = (body?.join ?? []).filter((g) => typeof g === "string");
    const leave = (body?.leave ?? []).filter((g) => typeof g === "string");

    if (join.length === 0 && leave.length === 0) {
      throw ApiError.badRequest("Nothing to change");
    }

    const token = await keycloak.getServiceAccountToken();
    for (const groupId of join) {
      const r = await keycloak.adminRequest(
        `/users/${id}/groups/${groupId}`,
        token,
        { method: "PUT" },
      );
      if (!r.ok && r.status !== 204) {
        throw new ApiError(
          "SERVICE_UNAVAILABLE",
          `Failed to add user to group ${groupId}`,
          r.status,
        );
      }
    }
    for (const groupId of leave) {
      const r = await keycloak.adminRequest(
        `/users/${id}/groups/${groupId}`,
        token,
        { method: "DELETE" },
      );
      if (!r.ok && r.status !== 204 && r.status !== 404) {
        throw new ApiError(
          "SERVICE_UNAVAILABLE",
          `Failed to remove user from group ${groupId}`,
          r.status,
        );
      }
    }

    // Po zmianie grup: kolejkuj sync natywnych providerów (Moodle, Chatwoot,
    // Outline itd.) — composite roles z grup mapują na area natywny, więc
    // user musi być pre-created w aplikacji ZANIM spróbuje SSO (inaczej
    // np. Moodle: "There was a problem logging you in"). Fire-and-forget,
    // job worker retryuje przy transient failures.
    if (join.length > 0) {
      void syncNativeProvidersFromKcRoles({
        userId: id,
        actor: `admin:groups-update:${session?.user?.email ?? "unknown"}`,
      }).catch((err) => {
        logger.warn("syncNativeProvidersFromKcRoles failed (non-fatal)", {
          userId: id,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
