export const dynamic = "force-dynamic";

import { Pool } from "pg";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { getOptionalEnv } from "@/lib/env";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

let pool: Pool | null = null;
function getPool(): Pool {
  if (pool) return pool;
  const url = getOptionalEnv("CHATWOOT_DB_URL");
  if (!url) throw new ApiError("SERVICE_UNAVAILABLE", "CHATWOOT_DB_URL not set", 503);
  pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 });
  return pool;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const accountId = Number(getOptionalEnv("CHATWOOT_ACCOUNT_ID") || "1");
    const client = await getPool().connect();
    try {
      const r = await client.query<{
        id: number;
        name: string;
        channel_type: string;
        account_id: number;
      }>(
        `SELECT id, name, channel_type, account_id FROM inboxes
          WHERE account_id = $1 ORDER BY name`,
        [accountId],
      );
      return createSuccessResponse({ inboxes: r.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    return handleApiError(error);
  }
}
