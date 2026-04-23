import mysql from "mysql2/promise";
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
 * Postal provider — system ról Postala jest *zablokowany* na poziomie API:
 * dokumentacja Postala 3.x mówi wprost, że HTTP API służy wyłącznie do
 * wysyłki wiadomości, a zarządzanie użytkownikami wymaga CLI
 * (`postal make-user`) albo ingerencji w bazę. Dla centralnego IAM-u
 * schodzimy do MariaDB — `postal.users.admin` to boolean, który decyduje
 * o dostępie do panelu admin.
 *
 * Użytkownik Postala jest tworzony przy pierwszym SSO (natywny OIDC z
 * `local_auth=false`). Tu tylko aktualizujemy flagę `admin` i ew.
 * `first_name`/`last_name` na podstawie KC.
 */

const ROLE_USER = "user";
const ROLE_ADMIN = "admin";

function getConfig(): { dbUrl: string } {
  const dbUrl = getOptionalEnv("POSTAL_DB_URL");
  if (!dbUrl) throw new ProviderNotConfiguredError("postal");
  return { dbUrl };
}

let pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  const cfg = getConfig();
  if (!pool) {
    pool = mysql.createPool({
      uri: cfg.dbUrl,
      connectionLimit: 3,
      waitForConnections: true,
    });
  }
  return pool;
}

export class PostalProvider implements PermissionProvider {
  readonly id = "postal";
  readonly label = "Postal";

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
        key: "postal_admin_panel",
        label: "Panel administratora (organizacje, serwery)",
        group: "Administracja",
      },
      {
        key: "postal_message_manage",
        label: "Wysyłka i statystyki skrzynek",
        group: "Wiadomości",
      },
    ];
  }

  async listRoles(): Promise<NativeRole[]> {
    if (!this.isConfigured()) return [];
    const counts = await this.countByRole();
    return [
      {
        id: ROLE_USER,
        name: "User",
        description:
          "Zwykły użytkownik Postala — dostęp do serwerów, do których jest dodany.",
        permissions: ["postal_message_manage"],
        systemDefined: true,
        userCount: counts.user,
      },
      {
        id: ROLE_ADMIN,
        name: "Admin",
        description:
          "Pełen dostęp do panelu administratora (wszystkie organizacje i serwery).",
        permissions: ["postal_admin_panel", "postal_message_manage"],
        systemDefined: true,
        userCount: counts.admin,
      },
    ];
  }

  async createRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError("postal", "createRole");
  }

  async updateRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError("postal", "updateRole");
  }

  async deleteRole(): Promise<void> {
    throw new ProviderUnsupportedError("postal", "deleteRole");
  }

  async assignUserRole(args: AssignUserRoleArgs): Promise<void> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError("postal");
    const adminFlag = args.roleId === ROLE_ADMIN ? 1 : 0;
    const [result] = await getPool().execute(
      `UPDATE users
          SET admin = ?
        WHERE LOWER(email_address) = LOWER(?)`,
      [adminFlag, args.email],
    );
    // args.roleId === null → ROLE_USER (admin=0) fallback. Postal nie ma
    // konceptu "odebranie dostępu do panelu" poza usunięciem usera lub
    // detachem od wszystkich serwerów — tym zajmuje się admin Postala
    // ręcznie. Nasz sync dba tylko o flagę admin.
    void result;
  }

  async getUserRole(email: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const [rows] = await getPool().execute<mysql.RowDataPacket[]>(
      `SELECT admin FROM users WHERE LOWER(email_address) = LOWER(?) LIMIT 1`,
      [email],
    );
    const row = rows[0];
    if (!row) return null;
    return row.admin ? ROLE_ADMIN : ROLE_USER;
  }

  async syncUserProfile(args: ProfileSyncArgs): Promise<void> {
    if (!this.isConfigured()) return;
    const lookup = args.previousEmail ?? args.email;
    await getPool().execute(
      `UPDATE users
          SET email_address = COALESCE(NULLIF(?, ''), email_address),
              first_name    = COALESCE(NULLIF(?, ''), first_name),
              last_name     = COALESCE(NULLIF(?, ''), last_name)
        WHERE LOWER(email_address) = LOWER(?)`,
      [
        args.email,
        args.firstName ?? "",
        args.lastName ?? "",
        lookup,
      ],
    );
  }

  private async countByRole(): Promise<{ user: number; admin: number }> {
    try {
      const [rows] = await getPool().execute<mysql.RowDataPacket[]>(
        `SELECT admin, COUNT(*) AS c FROM users GROUP BY admin`,
      );
      let user = 0;
      let admin = 0;
      for (const row of rows) {
        const n = Number(row.c) || 0;
        if (row.admin) admin = n;
        else user = n;
      }
      return { user, admin };
    } catch {
      return { user: 0, admin: 0 };
    }
  }
}
