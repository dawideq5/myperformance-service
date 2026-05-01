export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { listRoutes } from "@/lib/email/postal";
import { ExternalServiceUnavailableError } from "@/lib/db";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { id } = await params;
    const routes = await listRoutes(Number(id));
    return createSuccessResponse({ routes });
  } catch (error) {
    if (error instanceof ExternalServiceUnavailableError) {
      return createSuccessResponse({ routes: [], degraded: true });
    }
    return handleApiError(error);
  }
}
