export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import { dashboardStats } from "@/lib/security/db";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);
    const stats = await dashboardStats();
    return createSuccessResponse(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
