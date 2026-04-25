export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { getOvhConfig } from "@/lib/email/db";
import {
  listEmailDomains,
  listMailboxNames,
} from "@/lib/email/ovh";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const config = await getOvhConfig();
    if (!config.appKey || !config.appSecret || !config.consumerKey) {
      throw ApiError.badRequest("OVH credentials not configured");
    }
    const creds = {
      endpoint: config.endpoint,
      appKey: config.appKey,
      appSecret: config.appSecret,
      consumerKey: config.consumerKey,
    };
    const domains = await listEmailDomains(creds);
    // Per domena: ile mailboxów (sequential żeby nie spamować OVH).
    const enriched = await Promise.all(
      domains.map(async (name) => {
        try {
          const accs = await listMailboxNames(creds, name);
          return { name, mailboxCount: accs.length };
        } catch {
          return { name, mailboxCount: -1 as const };
        }
      }),
    );
    return createSuccessResponse({ domains: enriched });
  } catch (error) {
    return handleApiError(error);
  }
}
