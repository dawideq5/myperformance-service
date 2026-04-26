export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import { getIpIntel } from "@/lib/security/risk";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

/**
 * GET /api/admin/security/intel?search=&status=blocked|active|all&limit=
 *
 * Łączy mp_blocked_ips + mp_security_events: per IP zwraca block info,
 * stats eventów (severity/category breakdown, distinct users/sources,
 * first/last seen), geo (kraj/miasto/ASN) i risk score 0-100 z
 * uzasadnieniami.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);

    const url = new URL(req.url);
    const search = url.searchParams.get("search") ?? undefined;
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam === "blocked" || statusParam === "active"
        ? statusParam
        : "all";
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

    const intel = await getIpIntel({
      search,
      status,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    // Sortuj po riskScore desc, potem ostatnio widziane
    intel.sort((a, b) => {
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      const aLast = a.events.lastSeen ? Date.parse(a.events.lastSeen) : 0;
      const bLast = b.events.lastSeen ? Date.parse(b.events.lastSeen) : 0;
      return bLast - aLast;
    });

    return createSuccessResponse({ intel });
  } catch (error) {
    return handleApiError(error);
  }
}
