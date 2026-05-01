export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import {
  isConfigured,
  listOrganizations,
  createOrganization,
} from "@/lib/email/postal";
import { appendPostalAudit } from "@/lib/email/db";
import { ExternalServiceUnavailableError } from "@/lib/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    if (!isConfigured()) {
      return createSuccessResponse({ organizations: [], configured: false });
    }
    const organizations = await listOrganizations();
    return createSuccessResponse({ organizations, configured: true });
  } catch (error) {
    if (error instanceof ExternalServiceUnavailableError) {
      return createSuccessResponse({ organizations: [], configured: true, degraded: true });
    }
    return handleApiError(error);
  }
}

interface PostPayload {
  name: string;
  ownerEmail?: string;
  timeZone?: string;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    if (!isConfigured()) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "POSTAL_DB_URL not configured",
        503,
      );
    }
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.name || body.name.trim().length === 0) {
      throw ApiError.badRequest("name required");
    }
    const actor = session.user?.email ?? "admin";
    const org = await createOrganization(body);
    await appendPostalAudit({
      actor,
      operation: "org.create",
      targetType: "organization",
      targetId: String(org.id),
      status: "ok",
      details: { name: org.name, uuid: org.uuid },
    });
    return createSuccessResponse({ organization: org });
  } catch (error) {
    if (error instanceof ExternalServiceUnavailableError) {
      return handleApiError(
        ApiError.serviceUnavailable("Postal niedostępne w trybie deweloperskim"),
      );
    }
    return handleApiError(error);
  }
}
