export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { ROLE_CATALOG, requireAdminPanel } from "@/lib/admin-auth";

interface Ctx {
  params: Promise<{ id: string }>;
}

interface RoleRepresentation {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
}

const ROLE_ORDER = new Map(ROLE_CATALOG.map((role, index) => [role.name, index]));
const ALLOWED_ROLE_NAMES = new Set(ROLE_CATALOG.map((role) => role.name));

async function listRealmRoles(adminToken: string) {
  const res = await keycloak.adminRequest("/roles?briefRepresentation=false", adminToken);
  if (!res.ok) {
    const details = await res.text();
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      "Failed to list realm roles",
      res.status,
      details,
    );
  }
  return (await res.json()) as RoleRepresentation[];
}

async function listUserRealmRoles(adminToken: string, id: string) {
  const res = await keycloak.adminRequest(
    `/users/${id}/role-mappings/realm`,
    adminToken,
  );
  if (!res.ok) {
    const details = await res.text();
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      "Failed to fetch user roles",
      res.status,
      details,
    );
  }
  return (await res.json()) as RoleRepresentation[];
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const adminToken = await keycloak.getServiceAccountToken();
    const [allRoles, assigned] = await Promise.all([
      listRealmRoles(adminToken),
      listUserRealmRoles(adminToken, id),
    ]);

    const assignedIds = new Set(assigned.map((r) => r.id));
    const roles = allRoles
      .filter((r) => ALLOWED_ROLE_NAMES.has(r.name as (typeof ROLE_CATALOG)[number]["name"]))
      .sort((a, b) => {
        const left = ROLE_ORDER.get(a.name as (typeof ROLE_CATALOG)[number]["name"]) ?? Number.MAX_SAFE_INTEGER;
        const right = ROLE_ORDER.get(b.name as (typeof ROLE_CATALOG)[number]["name"]) ?? Number.MAX_SAFE_INTEGER;
        return left - right;
      })
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        composite: r.composite,
        assigned: assignedIds.has(r.id),
      }));

    return createSuccessResponse({ roles });
  } catch (error) {
    return handleApiError(error);
  }
}

interface UpdateRolesPayload {
  add?: string[];
  remove?: string[];
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const body = (await req.json().catch(() => null)) as UpdateRolesPayload | null;
    const addNames = (body?.add ?? []).filter((name) => ALLOWED_ROLE_NAMES.has(name as (typeof ROLE_CATALOG)[number]["name"]));
    const removeNames = (body?.remove ?? []).filter((name) => ALLOWED_ROLE_NAMES.has(name as (typeof ROLE_CATALOG)[number]["name"]));
    if (addNames.length === 0 && removeNames.length === 0) {
      throw ApiError.badRequest("Nothing to change");
    }

    const adminToken = await keycloak.getServiceAccountToken();
    const allRoles = await listRealmRoles(adminToken);
    const byName = new Map(
      allRoles
        .filter((role) => ALLOWED_ROLE_NAMES.has(role.name as (typeof ROLE_CATALOG)[number]["name"]))
        .map((r) => [r.name, r]),
    );

    const addPayload = addNames
      .map((n) => byName.get(n))
      .filter(Boolean) as RoleRepresentation[];
    const removePayload = removeNames
      .map((n) => byName.get(n))
      .filter(Boolean) as RoleRepresentation[];

    if (addPayload.length > 0) {
      const addRes = await keycloak.adminRequest(
        `/users/${id}/role-mappings/realm`,
        adminToken,
        { method: "POST", body: JSON.stringify(addPayload) },
      );
      if (!addRes.ok) {
        const details = await addRes.text();
        throw new ApiError(
          "SERVICE_UNAVAILABLE",
          "Failed to assign roles",
          addRes.status,
          details,
        );
      }
    }

    if (removePayload.length > 0) {
      const removeRes = await keycloak.adminRequest(
        `/users/${id}/role-mappings/realm`,
        adminToken,
        { method: "DELETE", body: JSON.stringify(removePayload) },
      );
      if (!removeRes.ok) {
        const details = await removeRes.text();
        throw new ApiError(
          "SERVICE_UNAVAILABLE",
          "Failed to remove roles",
          removeRes.status,
          details,
        );
      }
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
