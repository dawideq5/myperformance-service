export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getOvhConfig } from "@/lib/email/db";
import { createSnapshot } from "@/lib/email/ovh";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface PostPayload {
  vpsName: string;
  description?: string;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.vpsName) throw ApiError.badRequest("vpsName required");

    const config = await getOvhConfig();
    if (!config.appKey || !config.appSecret || !config.consumerKey) {
      throw new ApiError("SERVICE_UNAVAILABLE", "OVH credentials not configured", 503);
    }
    const creds = {
      endpoint: config.endpoint,
      appKey: config.appKey,
      appSecret: config.appSecret,
      consumerKey: config.consumerKey,
    };
    const description =
      body.description ??
      `Manual snapshot triggered by ${session.user?.email ?? "admin"} at ${new Date().toISOString()}`;
    const result = await createSnapshot(creds, body.vpsName, description);
    return createSuccessResponse({
      ok: true,
      snapshotId: result.id,
      message:
        "Snapshot zlecony — OVH wykona go w ciągu kilku minut. Pojawi się jako 'lastSnapshot' po odświeżeniu.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
