export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { getOptionalEnv } from "@/lib/env";
import { requireAdminPanel } from "@/lib/admin-auth";
import { withExternalClient } from "@/lib/db";
import {
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const accountId = Number(getOptionalEnv("CHATWOOT_ACCOUNT_ID") || "1");
    const inboxes = await withExternalClient("CHATWOOT_DB_URL", async (c) => {
      const r = await c.query<{
        id: number;
        name: string;
        channel_type: string;
        account_id: number;
      }>(
        `SELECT id, name, channel_type, account_id FROM inboxes
          WHERE account_id = $1 ORDER BY name`,
        [accountId],
      );
      return r.rows;
    });
    return createSuccessResponse({ inboxes });
  } catch (error) {
    return handleApiError(error);
  }
}
