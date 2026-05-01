export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { isConfigured, listDomains } from "@/lib/email/postal";
import { ExternalServiceUnavailableError } from "@/lib/db";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    if (!isConfigured()) {
      return createSuccessResponse({ domains: [], configured: false });
    }
    const url = new URL(req.url);
    const serverId = url.searchParams.get("serverId");
    const domains = await listDomains(serverId ? Number(serverId) : undefined);
    return createSuccessResponse({ domains, configured: true });
  } catch (error) {
    if (error instanceof ExternalServiceUnavailableError) {
      return createSuccessResponse({ domains: [], configured: true, degraded: true });
    }
    return handleApiError(error);
  }
}
