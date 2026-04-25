export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getOvhConfig } from "@/lib/email/db";
import { verifyCredentials } from "@/lib/email/ovh";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const config = await getOvhConfig();
    if (!config.appKey || !config.appSecret || !config.consumerKey) {
      throw ApiError.badRequest("Brak kompletnych credentials OVH");
    }
    const result = await verifyCredentials({
      endpoint: config.endpoint,
      appKey: config.appKey,
      appSecret: config.appSecret,
      consumerKey: config.consumerKey,
    });
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
