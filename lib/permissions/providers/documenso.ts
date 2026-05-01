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

/**
 * Postgres może rzucić `40P01` (deadlock_detected) lub `40001`
 * (serialization_failure) gdy dwie transakcje konkurują o ten sam wiersz.
 * Documenso v2 schema (Organisation/Group/Member) jest podatne na takie
 * race-y przy równoległym assignUserRole tego samego usera. Polityka:
 * 3× retry z exp backoff 50/200/800ms — pozostałe błędy (FK violations,
 * unique violations) propagujemy bez retry.
 */
async function withDeadlockRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  const delays = [50, 200, 800];
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      // 40P01 = deadlock_detected, 40001 = serialization_failure
      if (code !== "40P01" && code !== "40001") throw err;
      lastErr = err;
      logger.warn("transaction retry on pg deadlock/serialization", {
        attempt: attempt + 1,
        maxAttempts,
        code,
      });
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
  }
  throw lastErr;
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

    await withDeadlockRetry(async () => {
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

      // UWAGA: NIE przypisujemy automatycznie organisation/team membership.
      // Documenso area-role (documenso_member/manager/admin) decyduje
      // wyłącznie o globalnym `User.roles` (USER vs USER+ADMIN). Members
      // organizacji nadaje admin EXPLICITNIE przez panel /admin/users/[id]
      // → tab Documenso (POST /api/admin/users/[id]/documenso). Auto-org
      // assignment był usunięty 2026-05-01 — wcześniej każdy user z rolą
      // documenso_* dostawał członkostwo w DOCUMENSO_ORGANISATION_ID, co
      // łamało politykę "org membership tylko gdy admin sam to przyznał".
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
    });
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

  async listUserEmails(): Promise<string[] | null> {
    if (!this.isConfigured()) return null;
    const client = await getPool().connect();
    try {
      const res = await client.query<{ email: string }>(
        `SELECT email FROM "User" WHERE email NOT LIKE 'deleted+%@deleted.local'`,
      );
      return res.rows.map((r) => r.email.toLowerCase());
    } catch {
      return null;
    } finally {
      client.release();
    }
  }

  async deleteUser(args: { email: string; previousEmail?: string }): Promise<void> {
    if (!this.isConfigured()) return;
    const lookup = args.previousEmail ?? args.email;
    await withDeadlockRetry(async () => {
    const client = await getPool().connect();
    try {
      // Documenso przechowuje podpisy + drafty per User. Hard DELETE rozbije
      // foreign keys (Document.userId, OrganisationMember.userId, sessions itp.).
      // Zamiast tego: anonimizujemy email + name, usuwamy z OrganisationMember
      // (zabranie dostępu do org-ów) i invalidujemy sesje. Tożsamość znika
      // z punktu widzenia user-a, audyt podpisów pozostaje (compliance).
      await client.query("BEGIN");
      const userRes = await client.query<{ id: number }>(
        `SELECT id FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [lookup],
      );
      const userId = userRes.rows[0]?.id;
      if (!userId) {
        await client.query("ROLLBACK");
        return;
      }
      // Usuń członkostwa w org/team — pełne odebranie dostępu.
      await client.query(
        `DELETE FROM "OrganisationMember" WHERE "userId" = $1`,
        [userId],
      ).catch(() => undefined);
      // Invaliduj sesje (jeśli tabela istnieje w danej wersji schematu).
      await client.query(
        `DELETE FROM "Session" WHERE "userId" = $1`,
        [userId],
      ).catch(() => undefined);
      // Anonimizuj.
      const anon = `deleted+${userId}@deleted.local`;
      await client.query(
        `UPDATE "User"
            SET email = $2,
                name = 'Konto usunięte',
                "disabled" = true
          WHERE id = $1`,
        [userId, anon],
      ).catch(async () => {
        // Starsze schematy bez kolumny "disabled" — fallback na sam rename.
        await client.query(
          `UPDATE "User" SET email = $2, name = 'Konto usunięte' WHERE id = $1`,
          [userId, anon],
        );
      });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    });
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
