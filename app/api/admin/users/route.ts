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
import { getArea } from "@/lib/permissions/areas";
import { assignUserAreaRole } from "@/lib/permissions/sync";

export interface AdminUserSummary {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean;
  emailVerified: boolean;
  createdTimestamp: number | null;
  requiredActions: string[];
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const firstParam = Number(url.searchParams.get("first") ?? "0");
    const maxParam = Number(url.searchParams.get("max") ?? "50");
    const first = Number.isFinite(firstParam) && firstParam >= 0 ? firstParam : 0;
    const max = Number.isFinite(maxParam) && maxParam > 0
      ? Math.min(maxParam, 200)
      : 50;

    const adminToken = await keycloak.getServiceAccountToken();

    const qs = new URLSearchParams();
    qs.set("first", String(first));
    qs.set("max", String(max));
    qs.set("briefRepresentation", "false");
    if (search) qs.set("search", search);

    const [usersRes, countRes] = await Promise.all([
      keycloak.adminRequest(`/users?${qs.toString()}`, adminToken),
      keycloak.adminRequest(
        `/users/count${search ? `?search=${encodeURIComponent(search)}` : ""}`,
        adminToken,
      ),
    ]);

    if (!usersRes.ok) {
      const details = await usersRes.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to list users",
        usersRes.status,
        details,
      );
    }

    const rawUsers: any[] = await usersRes.json();
    const total = countRes.ok ? Number(await countRes.text()) || 0 : rawUsers.length;

    const users: AdminUserSummary[] = rawUsers.map((u) => ({
      id: u.id,
      username: u.username ?? "",
      email: u.email ?? null,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      enabled: u.enabled !== false,
      emailVerified: u.emailVerified === true,
      createdTimestamp: u.createdTimestamp ?? null,
      requiredActions: Array.isArray(u.requiredActions) ? u.requiredActions : [],
    }));

    return createSuccessResponse({ users, total, first, max });
  } catch (error) {
    return handleApiError(error);
  }
}

interface InvitePayload {
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  actions?: string[];
  sendEmail?: boolean;
  areaRoles?: Array<{ areaId: string; roleName: string | null }>;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const body = (await request.json().catch(() => null)) as InvitePayload | null;
    const email = body?.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw ApiError.badRequest("Valid email required");
    }

    const firstName = body?.firstName?.trim() || "";
    const lastName = body?.lastName?.trim() || "";
    const username = body?.username?.trim() || email;
    const actions =
      Array.isArray(body?.actions) && body.actions.length > 0
        ? body.actions
        : ["UPDATE_PASSWORD", "VERIFY_EMAIL"];
    const sendEmail = body?.sendEmail !== false;

    const adminToken = await keycloak.getServiceAccountToken();

    const createRes = await keycloak.adminRequest("/users", adminToken, {
      method: "POST",
      body: JSON.stringify({
        username,
        email,
        firstName,
        lastName,
        enabled: true,
        emailVerified: false,
        requiredActions: actions,
      }),
    });

    if (createRes.status === 409) {
      throw ApiError.conflict("User with that email or username already exists");
    }
    if (!createRes.ok) {
      const details = await createRes.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to create user",
        createRes.status,
        details,
      );
    }

    const location = createRes.headers.get("location") || "";
    const newId = location.split("/").pop() || "";

    // Pre-assign area roles (if any) before the invite email goes out, tak
    // żeby user miał uprawnienia przy pierwszym logowaniu.
    const areaRoles = Array.isArray(body?.areaRoles) ? body.areaRoles : [];
    const roleAssignmentErrors: Array<{ areaId: string; error: string }> = [];
    for (const ar of areaRoles) {
      if (!ar?.areaId || !getArea(ar.areaId)) continue;
      const roleName =
        ar.roleName === undefined || ar.roleName === null
          ? null
          : String(ar.roleName);
      try {
        await assignUserAreaRole({ userId: newId, areaId: ar.areaId, roleName });
      } catch (err) {
        roleAssignmentErrors.push({
          areaId: ar.areaId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (sendEmail && newId) {
      try {
        await keycloak.executeActionsEmail(adminToken, newId, actions, {
          lifespan: 60 * 60 * 24 * 7,
        });
      } catch (emailErr) {
        console.warn("[admin/users POST] invite email failed:", emailErr);
      }
    }

    return createSuccessResponse({
      id: newId,
      email,
      invited: sendEmail,
      roleAssignmentErrors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
