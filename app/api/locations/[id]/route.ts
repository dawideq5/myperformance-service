export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { canAccessKeycloakAdmin, canManageCertificates } from "@/lib/admin-auth";
import {
  deleteLocation,
  getLocation,
  updateLocation,
  type LocationInput,
} from "@/lib/locations";
import { logLocationAction } from "@/lib/location-audit";
import { getClientIp } from "@/lib/rate-limit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const { id } = await params;
    const location = await getLocation(id);
    if (!location) throw ApiError.notFound("Location not found");
    return createSuccessResponse({ location });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    if (!canManageCertificates(session) && !canAccessKeycloakAdmin(session)) {
      throw ApiError.forbidden("Edycja punktów wymaga uprawnień admin");
    }
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Partial<LocationInput> | null;
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Invalid JSON body");
    }
    try {
      const location = await updateLocation(id, body);
      await logLocationAction({
        locationId: id,
        userId: session.user?.id ?? null,
        userEmail: session.user?.email ?? null,
        actionType: "details.updated",
        payload: { changedFields: Object.keys(body) },
        srcIp: getClientIp(req),
      });
      return createSuccessResponse({ location });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw ApiError.badRequest(msg);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    if (!canManageCertificates(session) && !canAccessKeycloakAdmin(session)) {
      throw ApiError.forbidden("Usuwanie punktów wymaga uprawnień admin");
    }
    const { id } = await params;
    await deleteLocation(id);
    await logLocationAction({
      locationId: id,
      userId: session.user?.id ?? null,
      userEmail: session.user?.email ?? null,
      actionType: "details.deleted",
      srcIp: getClientIp(req),
    });
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
