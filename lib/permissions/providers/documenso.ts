import { Pool } from "pg";
import { getOptionalEnv } from "@/lib/env";
import type {
  AssignUserRoleArgs,
  NativePermission,
  NativeRole,
  PermissionProvider,
  ProfileSyncArgs,
} from "./types";
import { ProviderNotConfiguredError, ProviderUnsupportedError } from "./types";

/**
 * Documenso provider — role są sztywną enum-listą `Role[]` w Postgresie.
 *
 * Documenso API v2 nie ma endpointu do zarządzania rolami użytkownika, więc
 * schodzimy do DB. Każdy user ma w polu `roles` tablicę — minimum to
 * `['USER']`, administratorzy mają `['USER','ADMIN']` (ADMIN odblokowuje
 * `/admin`). Brak customowych ról — `supportsCustomRoles() === false`.
 */

const ROLE_MEMBER = "USER";
const ROLE_ADMIN = "ADMIN";

let pool: Pool | null = null;

function getConfig(): { dbUrl: string } {
  const dbUrl = getOptionalEnv("DOCUMENSO_DB_URL");
  if (!dbUrl) throw new ProviderNotConfiguredError("documenso");
  return { dbUrl };
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
    pool.on("error", (err) => {
      console.error("[documenso-provider] pg pool error:", err.message);
    });
  }
  return pool;
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
    // Documenso nie operuje ziarnistymi uprawnieniami — rola ADMIN vs USER
    // kontroluje wszystko. Zwracamy symboliczne pozycje do UI.
    return [
      {
        key: "admin_panel",
        label: "Dostęp do /admin (instancja-wide)",
        group: "Administracja",
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
        name: "User",
        description:
          "Pełne UI Documenso bez panelu administratora. Domyślny poziom.",
        permissions: ["sign_documents"],
        systemDefined: true,
        userCount: counts.user,
      },
      {
        id: ROLE_ADMIN,
        name: "Admin",
        description:
          "Dostęp do /admin (użytkownicy, szablony, webhooki całej instancji).",
        permissions: ["admin_panel", "sign_documents"],
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
    const rolesArray =
      args.roleId === ROLE_ADMIN ? [ROLE_MEMBER, ROLE_ADMIN] : [ROLE_MEMBER];

    const client = await getPool().connect();
    try {
      // roleId === null → traktujemy jako "odebranie dostępu" => USER
      // (Documenso nie pozwala na konto bez USER, a SSO i tak zaloguje
      // ponownie z USER). Aby zablokować konto kompletnie, admin musi to
      // zrobić w natywnym UI Documenso (disabled flag).
      const res = await client.query(
        `UPDATE "User"
            SET roles = $2::"Role"[]
          WHERE LOWER(email) = LOWER($1)`,
        [args.email, rolesArray],
      );
      if ((res.rowCount ?? 0) === 0) {
        // Użytkownik nie zalogował się jeszcze do Documenso (OIDC utworzy
        // rekord przy pierwszym loginie). Sync zostanie zrobiony wtedy.
      }
    } finally {
      client.release();
    }
  }

  async getUserRole(email: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const client = await getPool().connect();
    try {
      const res = await client.query<{ roles: string[] }>(
        `SELECT roles FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      );
      const row = res.rows[0];
      if (!row) return null;
      if (row.roles?.includes(ROLE_ADMIN)) return ROLE_ADMIN;
      if (row.roles?.includes(ROLE_MEMBER)) return ROLE_MEMBER;
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

  private async countByRole(): Promise<{ user: number; admin: number }> {
    const client = await getPool().connect();
    try {
      const res = await client.query<{ role: string; count: string }>(
        `SELECT unnest(roles)::text AS role, COUNT(*) AS count
           FROM "User"
          GROUP BY role`,
      );
      let user = 0;
      let admin = 0;
      for (const row of res.rows) {
        const n = Number(row.count) || 0;
        if (row.role === ROLE_ADMIN) admin = n;
        else if (row.role === ROLE_MEMBER) user = n;
      }
      return { user, admin };
    } catch {
      return { user: 0, admin: 0 };
    } finally {
      client.release();
    }
  }
}
