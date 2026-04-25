export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
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

    return await withExternalClient("DOCUMENSO_DB_URL", async (client) => {
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
    });
  } catch (error) {
    return handleApiError(error);
  }
}
