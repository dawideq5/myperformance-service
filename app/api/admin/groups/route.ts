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

export interface AdminGroupMember {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface AdminGroupSummary {
  id: string;
  name: string;
  description: string | null;
  realmRoles: string[];
  memberCount: number;
  members: AdminGroupMember[];
}

async function fetchGroupRoles(
  id: string,
  token: string,
): Promise<string[]> {
  const res = await keycloak.adminRequest(
    `/groups/${id}/role-mappings/realm`,
    token,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{ name?: string }>;
  return data.map((r) => r.name ?? "").filter(Boolean);
}

async function fetchGroupMembers(
  id: string,
  token: string,
): Promise<AdminGroupMember[]> {
  const res = await keycloak.adminRequest(
    `/groups/${id}/members?max=200`,
    token,
  );
  if (!res.ok) return [];
  const raw = (await res.json()) as Array<{
    id: string;
    username?: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }>;
  return raw.map((u) => ({
    id: u.id,
    username: u.username ?? "",
    email: u.email ?? null,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
  }));
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const token = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(
      "/groups?briefRepresentation=false&max=200",
      token,
    );
    if (!res.ok) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to list groups",
        res.status,
      );
    }
    const raw = (await res.json()) as Array<{
      id: string;
      name: string;
      attributes?: Record<string, string[]>;
    }>;

    // Pomijamy auto-generated `app-*` legacy groups (kc-sync je już nie tworzy).
    const filtered = raw.filter((g) => !g.name.startsWith("app-"));

    const groups: AdminGroupSummary[] = await Promise.all(
      filtered.map(async (g) => {
        const [realmRoles, members] = await Promise.all([
          fetchGroupRoles(g.id, token),
          fetchGroupMembers(g.id, token),
        ]);
        const description = g.attributes?.description?.[0] ?? null;
        return {
          id: g.id,
          name: g.name,
          description,
          realmRoles,
          memberCount: members.length,
          members,
        };
      }),
    );

    return createSuccessResponse({ groups });
  } catch (error) {
    return handleApiError(error);
  }
}

interface CreatePayload {
  name?: string;
  description?: string;
  realmRoles?: string[];
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const body = (await req.json().catch(() => null)) as CreatePayload | null;
    const name = body?.name?.trim();
    if (!name) throw ApiError.badRequest("Group name required");

    const description = body?.description?.trim() || "";
    const roleNames = Array.isArray(body?.realmRoles)
      ? body.realmRoles.filter((r) => typeof r === "string" && r.trim())
      : [];

    const token = await keycloak.getServiceAccountToken();
    const createRes = await keycloak.adminRequest("/groups", token, {
      method: "POST",
      body: JSON.stringify({
        name,
        attributes: description ? { description: [description] } : {},
      }),
    });
    if (createRes.status === 409) {
      throw ApiError.conflict("Group with that name already exists");
    }
    if (!createRes.ok) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to create group",
        createRes.status,
      );
    }
    const location = createRes.headers.get("location") ?? "";
    const id = location.split("/").pop() ?? "";

    if (id && roleNames.length > 0) {
      const rolesListRes = await keycloak.adminRequest(
        "/roles?briefRepresentation=false",
        token,
      );
      if (rolesListRes.ok) {
        const allRoles = (await rolesListRes.json()) as Array<{
          id: string;
          name: string;
        }>;
        const payload = allRoles
          .filter((r) => roleNames.includes(r.name))
          .map((r) => ({ id: r.id, name: r.name }));
        if (payload.length > 0) {
          await keycloak.adminRequest(`/groups/${id}/role-mappings/realm`, token, {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      }
    }

    return createSuccessResponse({ id, name });
  } catch (error) {
    return handleApiError(error);
  }
}
