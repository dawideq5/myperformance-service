export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { requireAdminPanel } from "@/lib/admin-auth";
import { withExternalClient } from "@/lib/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ id: string }>;
}

interface OrgRow {
  id: string;
  name: string;
  type: "PERSONAL" | "ORGANISATION";
}

interface TeamRow {
  id: number;
  name: string;
  url: string;
  organisationId: string;
}

interface MembershipRow {
  organisationId: string;
  organisationName: string;
  organisationRole: "ADMIN" | "MANAGER" | "MEMBER" | null;
}

/**
 * GET — zwraca:
 *   • allOrganisations — wszystkie ORGANISATION-type orgs (skip PERSONAL)
 *     + teams w każdej.
 *   • memberships — orgs gdzie user obecnie należy + jego organisationRole
 *     (poprzez OrganisationGroupMember → OrganisationGroup).
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id: userId } = await params;
    const token = await keycloak.getServiceAccountToken();

    // Email z KC.
    const userResp = await keycloak.adminRequest(`/users/${userId}`, token);
    if (!userResp.ok) throw ApiError.notFound("User not found");
    const userData = (await userResp.json()) as { email?: string };
    const email = userData.email;
    if (!email) {
      return createSuccessResponse({
        allOrganisations: [],
        memberships: [],
        documensoUserId: null,
        userEmail: null,
      });
    }

    return await withExternalClient("DOCUMENSO_DB_URL", async (client) => {
      // Documenso user id (wymagany do query memberships).
      const userRes = await client.query<{ id: number }>(
        `SELECT id FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      );
      const documensoUserId = userRes.rows[0]?.id ?? null;

      // 1. Wszystkie ORGANISATION orgs + teams.
      const orgsRes = await client.query<OrgRow>(
        `SELECT id, name, type FROM "Organisation" WHERE type = 'ORGANISATION' ORDER BY name`,
      );
      const teamsRes = await client.query<TeamRow>(
        `SELECT id, name, url, "organisationId" FROM "Team" ORDER BY name`,
      );
      const teamsByOrg = new Map<string, TeamRow[]>();
      for (const t of teamsRes.rows) {
        const arr = teamsByOrg.get(t.organisationId) ?? [];
        arr.push(t);
        teamsByOrg.set(t.organisationId, arr);
      }
      const allOrganisations = orgsRes.rows.map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        teams: teamsByOrg.get(o.id) ?? [],
      }));

      // 2. Memberships usera (org-level role through INTERNAL_ORGANISATION group).
      let memberships: MembershipRow[] = [];
      if (documensoUserId !== null) {
        const memRes = await client.query<MembershipRow>(
          `SELECT om."organisationId" AS "organisationId",
                  o.name AS "organisationName",
                  MAX(CASE og."organisationRole"
                        WHEN 'ADMIN' THEN 'ADMIN'
                        WHEN 'MANAGER' THEN 'MANAGER'
                        WHEN 'MEMBER' THEN 'MEMBER'
                      END) AS "organisationRole"
             FROM "OrganisationMember" om
             JOIN "Organisation" o ON o.id = om."organisationId"
             LEFT JOIN "OrganisationGroupMember" ogm ON ogm."organisationMemberId" = om.id
             LEFT JOIN "OrganisationGroup" og
               ON og.id = ogm."groupId" AND og.type = 'INTERNAL_ORGANISATION'
            WHERE om."userId" = $1 AND o.type = 'ORGANISATION'
            GROUP BY om."organisationId", o.name`,
          [documensoUserId],
        );
        memberships = memRes.rows;
      }

      return createSuccessResponse({
        allOrganisations,
        memberships,
        documensoUserId,
        userEmail: email,
      });
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  action: "add" | "remove";
  organisationId: string;
  organisationRole?: "ADMIN" | "MANAGER" | "MEMBER";
}

/**
 * POST — add/remove user do/z org. Add → upsert OrganisationMember + dodaj
 * do INTERNAL_ORGANISATION group dla podanej role. Remove → DELETE
 * OrganisationMember (cascade kasuje OrganisationGroupMember).
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id: userId } = await params;
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.action || !body?.organisationId) {
      throw ApiError.badRequest("action + organisationId required");
    }

    const token = await keycloak.getServiceAccountToken();
    const userResp = await keycloak.adminRequest(`/users/${userId}`, token);
    if (!userResp.ok) throw ApiError.notFound("User not found");
    const userData = (await userResp.json()) as {
      email?: string;
      firstName?: string;
      lastName?: string;
    };
    const email = userData.email;
    if (!email) throw ApiError.badRequest("User has no email");
    const fullName =
      [userData.firstName, userData.lastName].filter(Boolean).join(" ").trim() ||
      null;

    return await withExternalClient("DOCUMENSO_DB_URL", async (client) => {
      // Pre-create — gdy user nie zalogował się jeszcze do Documenso, sami
      // zakładamy mu konto z KC profilu. OIDC przy pierwszym loginie złączy
      // się po emailu (UNIQUE) i tylko zaktualizuje identityProvider.
      let userRes = await client.query<{ id: number }>(
        `SELECT id FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      );
      if (userRes.rows.length === 0 && body.action === "add") {
        await client.query(
          `INSERT INTO "User" (email, name, "identityProvider", roles)
           VALUES ($1, $2, 'DOCUMENSO'::"IdentityProvider", ARRAY['USER']::"Role"[])
           ON CONFLICT (email) DO NOTHING`,
          [email, fullName],
        );
        userRes = await client.query<{ id: number }>(
          `SELECT id FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [email],
        );
      }
      const documensoUserId = userRes.rows[0]?.id;
      if (!documensoUserId) {
        throw ApiError.conflict(
          "User nie ma jeszcze konta w Documenso i nie udało się go utworzyć.",
        );
      }

      if (body.action === "remove") {
        await client.query(
          `DELETE FROM "OrganisationMember"
            WHERE "userId" = $1 AND "organisationId" = $2`,
          [documensoUserId, body.organisationId],
        );
        return createSuccessResponse({ ok: true });
      }

      // action = add — auto-detect organisationRole z realm roles user'a w KC.
      // documenso_admin → ADMIN, documenso_manager → MANAGER, default → MEMBER.
      // Klient może override przez `organisationRole` w body, ale jeśli pusty
      // (toggle "Daj dostęp" w UI) — bierzemy z realm roles.
      let role = body.organisationRole;
      if (!role) {
        const rolesRes = await keycloak.adminRequest(
          `/users/${userId}/role-mappings/realm`,
          token,
        );
        const userRoles = rolesRes.ok
          ? ((await rolesRes.json()) as Array<{ name: string }>).map((r) => r.name)
          : [];
        role = userRoles.includes("documenso_admin")
          ? "ADMIN"
          : userRoles.includes("documenso_manager")
            ? "MANAGER"
            : "MEMBER";
      }
      if (!["ADMIN", "MANAGER", "MEMBER"].includes(role)) {
        throw ApiError.badRequest("Invalid role");
      }

      try {
        await client.query("BEGIN");
        await runTxBody(client, body, documensoUserId, role);
        await client.query("COMMIT");
        return createSuccessResponse({ ok: true });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function runTxBody(
  client: import("pg").PoolClient,
  body: PostPayload,
  documensoUserId: number,
  role: string,
): Promise<void> {
  // 1. Upsert org membership.
  await client.query(
    `INSERT INTO "OrganisationMember"
       (id, "organisationId", "userId", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, NOW(), NOW())
     ON CONFLICT ("userId", "organisationId") DO NOTHING`,
    [body.organisationId, documensoUserId],
  );
  // 2. Find INTERNAL_ORGANISATION group with target role.
  const grpRes = await client.query<{ id: string }>(
    `SELECT id FROM "OrganisationGroup"
      WHERE "organisationId" = $1
        AND "organisationRole" = $2::"OrganisationMemberRole"
        AND type = 'INTERNAL_ORGANISATION'
      LIMIT 1`,
    [body.organisationId, role],
  );
  const targetGroupId = grpRes.rows[0]?.id;
  if (!targetGroupId) return;
  // 3. Remove user from other INTERNAL_ORGANISATION groups in this org.
  await client.query(
    `DELETE FROM "OrganisationGroupMember" ogm
      USING "OrganisationMember" om, "OrganisationGroup" og
      WHERE ogm."organisationMemberId" = om.id
        AND ogm."groupId" = og.id
        AND om."userId" = $1
        AND og."organisationId" = $2
        AND og.type = 'INTERNAL_ORGANISATION'
        AND og.id <> $3`,
    [documensoUserId, body.organisationId, targetGroupId],
  );
  // 4. Insert into target group.
  await client.query(
    `INSERT INTO "OrganisationGroupMember" (id, "organisationMemberId", "groupId")
     SELECT gen_random_uuid()::text, om.id, $1
       FROM "OrganisationMember" om
      WHERE om."userId" = $2 AND om."organisationId" = $3
     ON CONFLICT ("organisationMemberId", "groupId") DO NOTHING`,
    [targetGroupId, documensoUserId, body.organisationId],
  );
}
