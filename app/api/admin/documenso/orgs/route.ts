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
  const url = getOptionalEnv("DOCUMENSO_DB_URL");
  if (!url) throw new ApiError("SERVICE_UNAVAILABLE", "DOCUMENSO_DB_URL not set", 503);
  pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 });
  return pool;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const client = await getPool().connect();
    try {
      const orgsRes = await client.query<{ id: string; name: string; type: string }>(
        `SELECT id, name, type FROM "Organisation" WHERE type = 'ORGANISATION' ORDER BY name`,
      );
      const teamsRes = await client.query<{
        id: number;
        name: string;
        url: string;
        organisationId: string;
      }>(`SELECT id, name, url, "organisationId" FROM "Team" ORDER BY name`);

      const teamsByOrg = new Map<string, typeof teamsRes.rows>();
      for (const t of teamsRes.rows) {
        const arr = teamsByOrg.get(t.organisationId) ?? [];
        arr.push(t);
        teamsByOrg.set(t.organisationId, arr);
      }
      return createSuccessResponse({
        organisations: orgsRes.rows.map((o) => ({
          id: o.id,
          name: o.name,
          type: o.type,
          teams: teamsByOrg.get(o.id) ?? [],
        })),
      });
    } finally {
      client.release();
    }
  } catch (error) {
    return handleApiError(error);
  }
}
