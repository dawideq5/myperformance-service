import { Pool } from "pg";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import {
  type DocumensoTeamRole,
  documensoGlobalRolesForTeamRole,
} from "@/lib/documenso";
import type {
  AssignUserRoleArgs,
  NativePermission,
  NativeRole,
  PermissionProvider,
  ProfileSyncArgs,
} from "./types";
import { ProviderNotConfiguredError, ProviderUnsupportedError } from "./types";

/**
 * Documenso provider — sztywna enumeracja ról (ADMIN/MANAGER/MEMBER) zgodnie
 * z dokumentacją Documenso API v2 (Teams). Raport IAM:
 *
 *   „Biorąc pod uwagę fakt, iż za pomocą API Documenso nie można stworzyć
 *    niestandardowych profili organizacyjnych, Agent AI programując panel
 *    główny, musi zaimplementować regułę tłumaczenia logiki bezpieczeństwa.
 *    Aplikacja nadrzędna powinna analizować wagę uprawnień przypisanych
 *    w modelu głównym do Metaroli i przy wywoływaniu żądania do interfejsu
 *    V2 Teams API aplikować najbardziej adekwatny profil enumeracji."
 *
 * Provider:
 *   - listRoles: 3 statyczne pozycje (MEMBER / MANAGER / ADMIN)
 *   - assignUserRole: bezpośredni UPDATE na `User.roles` (Postgres `Role[]`)
 *     + (opcjonalnie) propagacja do `TeamMember.role` gdy `DOCUMENSO_TEAM_ID`
 *     skonfigurowane.
 *   - create/update/deleteRole: nieobsługiwane (rzuca `ProviderUnsupportedError`).
 */

const logger = log.child({ module: "documenso-provider" });

const ROLE_MEMBER: DocumensoTeamRole = "MEMBER";
const ROLE_MANAGER: DocumensoTeamRole = "MANAGER";
const ROLE_ADMIN: DocumensoTeamRole = "ADMIN";

let pool: Pool | null = null;

interface Config {
  dbUrl: string;
  teamId: number | null;
  organisationId: string | null;
}

function getConfig(): Config {
  const dbUrl = getOptionalEnv("DOCUMENSO_DB_URL");
  if (!dbUrl) throw new ProviderNotConfiguredError("documenso");
  const rawTeam = getOptionalEnv("DOCUMENSO_TEAM_ID");
  const teamId = rawTeam ? Number(rawTeam) : null;
  // `Documenso v2+` wprowadziło OrganisationMember z rolami
  // ORGANISATION_OWNER / ORGANISATION_ADMIN / ORGANISATION_MEMBER.
  // Gdy DOCUMENSO_ORGANISATION_ID jest ustawione — propagujemy rolę
  // również na poziom organizacji (MANAGER/ADMIN w naszym panelu →
  // ORGANISATION_ADMIN, MEMBER → ORGANISATION_MEMBER).
  const organisationId = getOptionalEnv("DOCUMENSO_ORGANISATION_ID") || null;
  return {
    dbUrl,
    teamId: Number.isFinite(teamId) ? teamId : null,
    organisationId,
  };
}

function getPool(): Pool {
  const cfg = getConfig();
  if (!pool) {
    pool = new Pool({
      connectionString: cfg.dbUrl,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (err: Error) => {
      logger.error("pg pool error", { err: err.message });
    });
  }
  return pool;
}

function isTeamRole(v: string): v is DocumensoTeamRole {
  return v === ROLE_MEMBER || v === ROLE_MANAGER || v === ROLE_ADMIN;
}

export class DocumensoProvider implements PermissionProvider {
  readonly id = "documenso";
  readonly label = "Documenso";

  isConfigured(): boolean {
    try {
      getConfig();
      return true;
    } catch {
      return false;
    }
  }

  supportsCustomRoles(): boolean {
    return false;
  }

  async listPermissions(): Promise<NativePermission[]> {
    return [
      {
        key: "admin_panel",
        label: "Dostęp do /admin (instancja-wide)",
        group: "Administracja",
      },
      {
        key: "team_manage_members",
        label: "Zarządzanie członkami zespołu",
        group: "Zespół",
      },
      {
        key: "team_view_restricted",
        label: "Wgląd w dokumenty oznaczone dla menedżerów",
        group: "Zespół",
      },
      {
        key: "sign_documents",
        label: "Podpisywanie i tworzenie dokumentów",
        group: "Dokumenty",
      },
    ];
  }

  async listRoles(): Promise<NativeRole[]> {
    if (!this.isConfigured()) return [];
    const counts = await this.countByRole();
    return [
      {
        id: ROLE_MEMBER,
        name: "Member",
        description: "Standard — wgląd do bazowych dokumentów zespołu.",
        permissions: ["sign_documents"],
        systemDefined: true,
        userCount: counts.member,
      },
      {
        id: ROLE_MANAGER,
        name: "Manager",
        description:
          "Zarządza członkami zespołu o równej/niższej randze + wgląd do dokumentów restricted-to-manager.",
        permissions: [
          "sign_documents",
          "team_manage_members",
          "team_view_restricted",
        ],
        systemDefined: true,
        userCount: counts.manager,
      },
      {
        id: ROLE_ADMIN,
        name: "Admin",
        description:
          "Pełen dostęp do zespołu i `/admin` (użytkownicy, szablony, webhooki).",
        permissions: [
          "sign_documents",
          "team_manage_members",
          "team_view_restricted",
          "admin_panel",
        ],
        systemDefined: true,
        userCount: counts.admin,
      },
    ];
  }

  async createRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError("documenso", "createRole");
  }

  async updateRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError("documenso", "updateRole");
  }

  async deleteRole(): Promise<void> {
    throw new ProviderUnsupportedError("documenso", "deleteRole");
  }

  async assignUserRole(args: AssignUserRoleArgs): Promise<void> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError("documenso");

    // Walidacja enum — brak pasującej wartości traktujemy jako MEMBER (safest
    // possible default). Nigdy nie eskalujemy przy nieznanym inputcie.
    const teamRole: DocumensoTeamRole =
      args.roleId && isTeamRole(args.roleId) ? args.roleId : ROLE_MEMBER;
    const globalRoles = documensoGlobalRolesForTeamRole(teamRole);

    const cfg = getConfig();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");

      // Globalny User.roles — ADMIN otwiera /admin. Nie wymazujemy profilu
      // gdy `roleId === null` — Documenso nie pozwala na konto bez USER,
      // więc "odebranie" schodzi do MEMBER (= [USER]).
      const res = await client.query(
        `UPDATE "User"
            SET roles = $2::"Role"[],
                disabled = false
          WHERE LOWER(email) = LOWER($1)`,
        [args.email, globalRoles],
      );
      const updated = (res.rowCount ?? 0) > 0;

      if (updated && (cfg.teamId !== null || cfg.organisationId !== null)) {
        const userRes = await client.query<{ id: number }>(
          `SELECT id FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [args.email],
        );
        const userId = userRes.rows[0]?.id;
        if (userId) {
          // Documenso auto-tworzy "Personal Organisation" dla każdego nowego
          // usera przy OIDC signup. Admin nie chce ich mnożyć — po dodaniu
          // do shared org kasujemy personal orgs których owner to nasz user.
          // ON DELETE CASCADE w OrganisationMember posprząta membership.
          if (cfg.organisationId !== null) {
            await client.query(
              `DELETE FROM "Organisation"
                WHERE type = 'PERSONAL' AND "ownerUserId" = $1 AND id <> $2`,
              [userId, cfg.organisationId],
            );
          }
          // Organisation + team membership (Documenso v2 model).
          // Uwaga: `OrganisationMember` NIE ma kolumny `role` — role trzyma
          // `OrganisationGroup.organisationRole`, a przypisanie robi się
          // przez `OrganisationGroupMember`. Team-role dziedziczy przez
          // `TeamGroup` binding (group → team → teamRole).
          if (cfg.organisationId !== null) {
            const orgRole =
              teamRole === ROLE_ADMIN
                ? "ADMIN"
                : teamRole === ROLE_MANAGER
                  ? "MANAGER"
                  : "MEMBER";

            // 1. Upewnij się że user jest członkiem org (idempotentnie).
            await client.query(
              `INSERT INTO "OrganisationMember"
                 (id, "organisationId", "userId", "createdAt", "updatedAt")
               VALUES (gen_random_uuid()::text, $1, $2, NOW(), NOW())
               ON CONFLICT ("userId", "organisationId") DO NOTHING`,
              [cfg.organisationId, userId],
            );

            // 2. Team membership w v2 idzie przez OrganisationGroupMember →
            //    OrganisationGroup → TeamGroup. Seed Documenso tworzy 3
            //    INTERNAL_ORGANISATION grupy (ADMIN/MANAGER/MEMBER) bindowane
            //    do każdego team. Dodanie user do tej grupy automatycznie
            //    przyznaje team-role zgodnie z TeamGroup binding.
            const groupRes = await client.query<{ id: string }>(
              `SELECT id FROM "OrganisationGroup"
                WHERE "organisationId" = $1
                  AND "organisationRole" = $2::"OrganisationMemberRole"
                  AND type = 'INTERNAL_ORGANISATION'
                LIMIT 1`,
              [cfg.organisationId, orgRole],
            );
            const targetGroupId = groupRes.rows[0]?.id;

            if (targetGroupId) {
              // 3. Usuń user z innych INTERNAL_ORGANISATION grup tej org
              //    (single-role-per-org na poziomie grupy).
              await client.query(
                `DELETE FROM "OrganisationGroupMember" ogm
                  USING "OrganisationMember" om, "OrganisationGroup" og
                  WHERE ogm."organisationMemberId" = om.id
                    AND ogm."groupId" = og.id
                    AND om."userId" = $1
                    AND og."organisationId" = $2
                    AND og.type = 'INTERNAL_ORGANISATION'
                    AND og.id <> $3`,
                [userId, cfg.organisationId, targetGroupId],
              );
              // 4. Upewnij się że user jest w target grupie. INSERT przez
              //    JOIN z OrganisationMember (FK) + unique constraint
              //    (organisationMemberId, groupId) pilnuje idempotency.
              await client.query(
                `INSERT INTO "OrganisationGroupMember"
                   (id, "organisationMemberId", "groupId")
                 SELECT gen_random_uuid()::text, om.id, $1
                   FROM "OrganisationMember" om
                  WHERE om."userId" = $2 AND om."organisationId" = $3
                 ON CONFLICT ("organisationMemberId", "groupId") DO NOTHING`,
                [targetGroupId, userId, cfg.organisationId],
              );
            }
          }
        }
      }
      await client.query("COMMIT");

      if (!updated) {
        // Użytkownik nie zalogował się jeszcze do Documenso (OIDC utworzy
        // rekord przy pierwszym loginie). Sync zostanie wykonany wtedy.
        logger.info("user not found, will sync on next SSO login", {
          email: args.email,
          teamRole,
        });
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async getUserRole(email: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const cfg = getConfig();
    const client = await getPool().connect();
    try {
      // Org-level role: najwyższa przez OrganisationGroupMember → OrganisationGroup.
      if (cfg.organisationId !== null) {
        const res = await client.query<{ role: string }>(
          `SELECT og."organisationRole" AS role
             FROM "OrganisationGroupMember" ogm
             JOIN "OrganisationGroup" og ON og.id = ogm."groupId"
             JOIN "OrganisationMember" om ON om.id = ogm."organisationMemberId"
             JOIN "User" u ON u.id = om."userId"
            WHERE om."organisationId" = $1
              AND og.type = 'INTERNAL_ORGANISATION'
              AND LOWER(u.email) = LOWER($2)
            ORDER BY CASE og."organisationRole"
                       WHEN 'ADMIN' THEN 3
                       WHEN 'MANAGER' THEN 2
                       WHEN 'MEMBER' THEN 1
                     END DESC
            LIMIT 1`,
          [cfg.organisationId, email],
        );
        const row = res.rows[0];
        if (row?.role) {
          return row.role === "ADMIN"
            ? ROLE_ADMIN
            : row.role === "MANAGER"
              ? ROLE_MANAGER
              : ROLE_MEMBER;
        }
      }
      // Fallback — global User.roles.
      const res = await client.query<{ roles: string[] }>(
        `SELECT roles FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      );
      const row = res.rows[0];
      if (!row) return null;
      if (row.roles?.includes("ADMIN")) return ROLE_ADMIN;
      if (row.roles?.includes("USER")) return ROLE_MEMBER;
      return null;
    } finally {
      client.release();
    }
  }

  async syncUserProfile(args: ProfileSyncArgs): Promise<void> {
    if (!this.isConfigured()) return;
    const fullName =
      [args.firstName, args.lastName].filter(Boolean).join(" ").trim() ||
      args.displayName ||
      "";
    const lookup = args.previousEmail ?? args.email;
    const client = await getPool().connect();
    try {
      await client.query(
        `UPDATE "User"
            SET name  = COALESCE(NULLIF($3, ''), name),
                email = COALESCE(NULLIF($2, ''), email)
          WHERE LOWER(email) = LOWER($1)`,
        [lookup, args.email, fullName],
      );
    } finally {
      client.release();
    }
  }

  private async countByRole(): Promise<{
    member: number;
    manager: number;
    admin: number;
  }> {
    const cfg = getConfig();
    const client = await getPool().connect();
    try {
      if (cfg.organisationId !== null) {
        // Documenso v2: liczy userów per org-role przez OrganisationGroupMember.
        const res = await client.query<{ role: string; count: string }>(
          `SELECT og."organisationRole"::text AS role, COUNT(DISTINCT om."userId") AS count
             FROM "OrganisationGroupMember" ogm
             JOIN "OrganisationGroup" og ON og.id = ogm."groupId"
             JOIN "OrganisationMember" om ON om.id = ogm."organisationMemberId"
            WHERE om."organisationId" = $1
              AND og.type = 'INTERNAL_ORGANISATION'
            GROUP BY og."organisationRole"`,
          [cfg.organisationId],
        );
        let member = 0, manager = 0, admin = 0;
        for (const row of res.rows) {
          const n = Number(row.count) || 0;
          if (row.role === "ADMIN") admin = n;
          else if (row.role === "MANAGER") manager = n;
          else if (row.role === "MEMBER") member = n;
        }
        return { member, manager, admin };
      }
      // Fallback na globalne User.roles (brak granularności MANAGER).
      const res = await client.query<{ role: string; count: string }>(
        `SELECT unnest(roles)::text AS role, COUNT(*) AS count
           FROM "User"
          GROUP BY role`,
      );
      let member = 0,
        admin = 0;
      for (const row of res.rows) {
        const n = Number(row.count) || 0;
        if (row.role === "ADMIN") admin = n;
        else if (row.role === "USER") member = n;
      }
      return { member, manager: 0, admin };
    } catch (err) {
      logger.warn("countByRole failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      return { member: 0, manager: 0, admin: 0 };
    } finally {
      client.release();
    }
  }
}
