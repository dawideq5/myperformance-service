export const dynamic = "force-dynamic";

import { Pool } from "pg";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { getOptionalEnv } from "@/lib/env";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ id: string }>;
}

let pool: Pool | null = null;
function getPool(): Pool {
  if (pool) return pool;
  const url = getOptionalEnv("CHATWOOT_DB_URL");
  if (!url) throw new ApiError("SERVICE_UNAVAILABLE", "CHATWOOT_DB_URL not set", 503);
  pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 });
  return pool;
}

interface InboxRow {
  id: number;
  name: string;
  channel_type: string;
  account_id: number;
}

/**
 * GET /api/admin/users/[id]/chatwoot — zwraca:
 *   • allInboxes — wszystkie inbox'y w default account (1)
 *   • assignedInboxIds — inbox'y do których user ma access (inbox_members)
 *   • chatwootUserId — Chatwoot users.id (po emailu z KC), albo null gdy brak
 *   • accountRole — 0=agent / 1=administrator w account_users
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id: userId } = await params;
    const accountId = Number(getOptionalEnv("CHATWOOT_ACCOUNT_ID") || "1");

    const token = await keycloak.getServiceAccountToken();
    const userResp = await keycloak.adminRequest(`/users/${userId}`, token);
    if (!userResp.ok) throw ApiError.notFound("User not found");
    const userData = (await userResp.json()) as { email?: string };
    const email = userData.email;
    if (!email) {
      return createSuccessResponse({
        allInboxes: [],
        assignedInboxIds: [],
        chatwootUserId: null,
        accountRole: null,
      });
    }

    const client = await getPool().connect();
    try {
      const userRes = await client.query<{ id: number }>(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      );
      const chatwootUserId = userRes.rows[0]?.id ?? null;

      const inboxRes = await client.query<InboxRow>(
        `SELECT id, name, channel_type, account_id FROM inboxes
          WHERE account_id = $1 ORDER BY name`,
        [accountId],
      );

      let assignedInboxIds: number[] = [];
      let accountRole: number | null = null;
      if (chatwootUserId !== null) {
        const memRes = await client.query<{ inbox_id: number }>(
          `SELECT inbox_id FROM inbox_members WHERE user_id = $1`,
          [chatwootUserId],
        );
        assignedInboxIds = memRes.rows.map((r) => r.inbox_id);
        const accRes = await client.query<{ role: number }>(
          `SELECT role FROM account_users WHERE user_id = $1 AND account_id = $2 LIMIT 1`,
          [chatwootUserId, accountId],
        );
        accountRole = accRes.rows[0]?.role ?? null;
      }

      return createSuccessResponse({
        allInboxes: inboxRes.rows,
        assignedInboxIds,
        chatwootUserId,
        accountRole,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  action: "add" | "remove";
  inboxId: number;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id: userId } = await params;
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.action || !body?.inboxId) {
      throw ApiError.badRequest("action + inboxId required");
    }

    const token = await keycloak.getServiceAccountToken();
    const userResp = await keycloak.adminRequest(`/users/${userId}`, token);
    if (!userResp.ok) throw ApiError.notFound("User not found");
    const userData = (await userResp.json()) as { email?: string };
    const email = userData.email;
    if (!email) throw ApiError.badRequest("User has no email");

    const client = await getPool().connect();
    try {
      const userRes = await client.query<{ id: number }>(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      );
      const chatwootUserId = userRes.rows[0]?.id;
      if (!chatwootUserId) {
        throw ApiError.conflict(
          "User nie ma jeszcze konta w Chatwoocie. Niech zaloguje się przez SSO bridge.",
        );
      }

      if (body.action === "remove") {
        await client.query(
          `DELETE FROM inbox_members WHERE user_id = $1 AND inbox_id = $2`,
          [chatwootUserId, body.inboxId],
        );
      } else {
        await client.query(
          `INSERT INTO inbox_members (user_id, inbox_id, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (inbox_id, user_id) DO NOTHING`,
          [chatwootUserId, body.inboxId],
        );
      }

      return createSuccessResponse({ ok: true });
    } finally {
      client.release();
    }
  } catch (error) {
    return handleApiError(error);
  }
}
