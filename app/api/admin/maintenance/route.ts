export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getMaintenance, setMaintenance } from "@/lib/email/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const state = await getMaintenance();
    return createSuccessResponse({ maintenance: state });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PutPayload {
  enabled: boolean;
  message?: string | null;
  durationMinutes?: number;
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as PutPayload | null;
    if (!body || typeof body.enabled !== "boolean") {
      throw ApiError.badRequest("enabled (boolean) required");
    }
    const state = await setMaintenance(body, session.user?.email ?? "admin");
    return createSuccessResponse({ maintenance: state });
  } catch (error) {
    return handleApiError(error);
  }
}
