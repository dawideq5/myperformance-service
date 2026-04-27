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
  getLocationIdsForCertificate,
  getLocationsForCertificate,
  setCertificateLocations,
} from "@/lib/certificate-locations";
import { logLocationAction } from "@/lib/location-audit";
import { getClientIp } from "@/lib/rate-limit";

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
    const newIds = body.locationIds.filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    const oldIds = await getLocationIdsForCertificate(id);
    await setCertificateLocations({
      certificateId: id,
      locationIds: newIds,
      assignedBy: actor,
    });
    // Audit per-location: cert.assigned dla nowo dodanych, cert.unassigned
    // dla usuniętych. Pomaga w timeline historii punktu.
    const oldSet = new Set(oldIds);
    const newSet = new Set(newIds);
    const ip = getClientIp(req);
    await Promise.all([
      ...newIds
        .filter((lid) => !oldSet.has(lid))
        .map((lid) =>
          logLocationAction({
            locationId: lid,
            userId: session.user?.id ?? null,
            userEmail: session.user?.email ?? null,
            actionType: "cert.assigned",
            payload: { certificateId: id, by: actor },
            srcIp: ip,
          }),
        ),
      ...oldIds
        .filter((lid) => !newSet.has(lid))
        .map((lid) =>
          logLocationAction({
            locationId: lid,
            userId: session.user?.id ?? null,
            userEmail: session.user?.email ?? null,
            actionType: "cert.unassigned",
            payload: { certificateId: id, by: actor },
            srcIp: ip,
          }),
        ),
    ]);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
