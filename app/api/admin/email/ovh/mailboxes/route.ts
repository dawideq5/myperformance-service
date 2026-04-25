export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { getOvhConfig } from "@/lib/email/db";
import { listMailboxNames, getMailbox } from "@/lib/email/ovh";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const url = new URL(req.url);
    const domain = url.searchParams.get("domain");
    if (!domain) throw ApiError.badRequest("domain query required");

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
    const accountNames = await listMailboxNames(creds, domain);
    // Pobierz szczegóły każdej skrzynki — limit 50 żeby nie zalać OVH.
    const limited = accountNames.slice(0, 50);
    const accounts = await Promise.all(
      limited.map(async (name) => {
        const m = await getMailbox(creds, domain, name);
        return m ?? { email: `${name}@${domain}`, domain, size: 0, description: null, isBlocked: false, state: "unknown", primaryEmailAddress: `${name}@${domain}` };
      }),
    );
    return createSuccessResponse({
      domain,
      total: accountNames.length,
      shown: accounts.length,
      accounts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
