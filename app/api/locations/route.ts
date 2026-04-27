export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { canAccessKeycloakAdmin, canManageCertificates } from "@/lib/admin-auth";
import {
  createLocation,
  listLocations,
  type LocationInput,
  type LocationType,
} from "@/lib/locations";

/**
 * Listing punktów. Każdy zalogowany user może czytać listę (filter
 * enabled=true), ale create/update/delete wymaga admin role (panele
 * cert-gated polegają na tych danych).
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const url = new URL(req.url);
    const typeParam = url.searchParams.get("type");
    const includeDisabled = url.searchParams.get("all") === "1";
    const idsParam = url.searchParams.get("ids");

    const type: LocationType | undefined =
      typeParam === "sales" || typeParam === "service" ? typeParam : undefined;

    // Disabled locations widoczne tylko dla adminów.
    const canSeeDisabled =
      includeDisabled &&
      (canManageCertificates(session) || canAccessKeycloakAdmin(session));

    const locations = await listLocations({
      type,
      enabledOnly: !canSeeDisabled,
      ids: idsParam ? idsParam.split(",").filter(Boolean) : undefined,
    });

    return createSuccessResponse({ locations });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Create — wymaga admin role (certyfikaty admin lub keycloak admin).
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    if (!canManageCertificates(session) && !canAccessKeycloakAdmin(session)) {
      throw ApiError.forbidden(
        "Tworzenie punktów wymaga roli certificates_admin lub keycloak_admin",
      );
    }

    const body = (await req.json().catch(() => null)) as LocationInput | null;
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Invalid JSON body");
    }
    if (!body.name || (body.type !== "sales" && body.type !== "service")) {
      throw ApiError.badRequest("name + type (sales/service) required");
    }

    try {
      const location = await createLocation(body);
      return createSuccessResponse({ location });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw ApiError.badRequest(msg);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
