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
import { propagateProfileFromKc } from "@/lib/permissions/sync";

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
    const res = await keycloak.adminRequest(`/users/${id}`, adminToken);

    if (res.status === 404) throw ApiError.notFound("User not found");
    if (!res.ok) {
      const details = await res.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to load user",
        res.status,
        details,
      );
    }

    const u = await res.json();
    return createSuccessResponse({
      id: u.id,
      username: u.username ?? "",
      email: u.email ?? null,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      enabled: u.enabled !== false,
      emailVerified: u.emailVerified === true,
      createdTimestamp: u.createdTimestamp ?? null,
      requiredActions: keycloak.normalizeRequiredActions(
        Array.isArray(u.requiredActions) ? u.requiredActions : [],
      ),
      attributes: u.attributes ?? {},
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface UpdatePayload {
  enabled?: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailVerified?: boolean;
  /** Attribute values keyed by attr name. `null` removes the attribute. */
  attributes?: Record<string, string[] | null>;
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const body = (await req.json().catch(() => null)) as UpdatePayload | null;
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Invalid body");
    }

    const callerId = session.user?.id;
    if (callerId && callerId === id && body.enabled === false) {
      throw ApiError.badRequest("You cannot disable your own account");
    }

    const adminToken = await keycloak.getServiceAccountToken();
    const current = await keycloak.adminRequest(`/users/${id}`, adminToken);
    if (current.status === 404) throw ApiError.notFound("User not found");
    if (!current.ok) {
      const details = await current.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to load user",
        current.status,
        details,
      );
    }

    const userData = await current.json();
    const nextBody: Record<string, any> = { ...userData };
    if (body.enabled !== undefined) nextBody.enabled = body.enabled;
    if (body.firstName !== undefined) nextBody.firstName = body.firstName;
    if (body.lastName !== undefined) nextBody.lastName = body.lastName;
    if (body.email !== undefined) nextBody.email = body.email;
    if (body.emailVerified !== undefined)
      nextBody.emailVerified = body.emailVerified;
    if (body.attributes && typeof body.attributes === "object") {
      const merged = { ...(userData.attributes ?? {}) } as Record<
        string,
        string[]
      >;
      for (const [key, value] of Object.entries(body.attributes)) {
        if (value === null) delete merged[key];
        else if (Array.isArray(value)) merged[key] = value;
      }
      nextBody.attributes = merged;
    }

    const res = await keycloak.adminRequest(`/users/${id}`, adminToken, {
      method: "PUT",
      body: JSON.stringify(nextBody),
    });

    if (!res.ok) {
      const details = await res.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to update user",
        res.status,
        details,
      );
    }

    // Instant-logout: kickuj wszystkie sesje i propaguj do aplikacji przez
    // KC backchannel logout. Trigger dla każdej zmiany która wpływa na
    // dane profilu widziane w aplikacjach — inaczej apki mają stare
    // dane aż do ręcznego logout/login.
    //
    //   - konto zostało wyłączone (hard kick, security),
    //   - administrator unieważnił weryfikację emaila (security event),
    //   - zmiana firstName / lastName / email (SoT refresh).
    const profileFieldChanged =
      (body.firstName !== undefined && body.firstName !== userData.firstName) ||
      (body.lastName !== undefined && body.lastName !== userData.lastName) ||
      (body.email !== undefined && body.email !== userData.email);
    const shouldKick =
      body.enabled === false ||
      (body.emailVerified === false && userData.emailVerified === true) ||
      profileFieldChanged;
    if (shouldKick) {
      await keycloak
        .adminRequest(`/users/${id}/logout`, adminToken, { method: "POST" })
        .catch((err) => {
          console.warn("[admin/users PUT] forced logout failed:", err);
        });
    }

    // Profile propagation do natywnych aplikacji (Moodle/Chatwoot/Outline/
    // Directus/Documenso) — uruchamiamy best-effort po każdej zmianie pól
    // profilu lub telefonu. `previousEmail` pozwala znaleźć rekord jeśli
    // email się zmienił.
    const phoneChanged =
      body.attributes &&
      (Array.isArray(body.attributes.phoneNumber) ||
        body.attributes.phoneNumber === null);
    if (profileFieldChanged || phoneChanged) {
      const previousEmail =
        body.email !== undefined && body.email !== userData.email
          ? userData.email
          : undefined;
      await propagateProfileFromKc(id, { previousEmail }).catch((err) => {
        console.warn("[admin/users PUT] profile propagation failed:", err);
      });
    }

    return createSuccessResponse({ ok: true });
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

    const callerId = session.user?.id;
    if (callerId && callerId === id) {
      throw ApiError.badRequest("You cannot delete your own account");
    }

    const adminToken = await keycloak.getServiceAccountToken();
    const res = await keycloak.adminRequest(`/users/${id}`, adminToken, {
      method: "DELETE",
    });

    if (res.status === 404) throw ApiError.notFound("User not found");
    if (!res.ok) {
      const details = await res.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to delete user",
        res.status,
        details,
      );
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
