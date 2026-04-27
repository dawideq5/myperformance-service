export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { canManageCertificates } from "@/lib/admin-auth";
import {
  getLocationsForCertificate,
  setCertificateLocations,
} from "@/lib/certificate-locations";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    if (!canManageCertificates(session)) {
      throw ApiError.forbidden("Brak uprawnień do certyfikatów");
    }
    const { id } = await params;
    const locations = await getLocationsForCertificate(id);
    return createSuccessResponse({ locations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    if (!canManageCertificates(session)) {
      throw ApiError.forbidden("Brak uprawnień");
    }
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as {
      locationIds?: string[];
    } | null;
    if (!body || !Array.isArray(body.locationIds)) {
      throw ApiError.badRequest("locationIds[] required");
    }
    const actor = session.user?.email ?? session.user?.id ?? "admin";
    await setCertificateLocations({
      certificateId: id,
      locationIds: body.locationIds.filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      ),
      assignedBy: actor,
    });
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
