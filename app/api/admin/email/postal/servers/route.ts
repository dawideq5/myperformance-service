export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  isConfigured,
  listServers,
  createServer,
} from "@/lib/email/postal";
import { appendPostalAudit } from "@/lib/email/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    if (!isConfigured()) {
      return createSuccessResponse({ servers: [], configured: false });
    }
    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");
    const servers = await listServers(orgId ? Number(orgId) : undefined);
    return createSuccessResponse({ servers, configured: true });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  organizationId: number;
  name: string;
  mode?: "Live" | "Development";
  postmasterAddress?: string;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    if (!isConfigured()) {
      throw new ApiError("SERVICE_UNAVAILABLE", "POSTAL_DB_URL not configured", 503);
    }
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.name || !body.organizationId) {
      throw ApiError.badRequest("name + organizationId required");
    }
    const actor = session.user?.email ?? "admin";
    const server = await createServer(body);
    await appendPostalAudit({
      actor,
      operation: "server.create",
      targetType: "server",
      targetId: String(server.id),
      status: "ok",
      details: { name: server.name, organizationId: server.organizationId },
    });
    return createSuccessResponse({ server });
  } catch (error) {
    return handleApiError(error);
  }
}
