export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { getActiveLocationsForUser } from "@/lib/certificate-locations";

/**
 * GET /api/account/locations?type=sales|service
 *
 * Zwraca punkty do których user MA aktywny certyfikat klienta. Filtrowane
 * po type żeby panel launcher pokazał tylko adekwatne (np. /panel/sprzedawca
 * → tylko sales). Używane w F13.E1 launcher do decyzji 1-vs-many.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? undefined;
    const email = session.user?.email;
    if (!email) {
      return createSuccessResponse({ locations: [] });
    }
    const locations = await getActiveLocationsForUser({ email, panelType: type });
    return createSuccessResponse({ locations });
  } catch (error) {
    return handleApiError(error);
  }
}
