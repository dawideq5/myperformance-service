import mysql from "mysql2/promise";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import type {
  AssignUserRoleArgs,
  NativePermission,
  NativeRole,
  PermissionProvider,
  ProfileSyncArgs,
} from "./types";
import { ProviderNotConfiguredError, ProviderUnsupportedError } from "./types";

const logger = log.child({ module: "postal-provider" });

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
    const [result] = await getPool().execute<mysql.ResultSetHeader>(
      `UPDATE users
          SET admin = ?
        WHERE LOWER(email_address) = LOWER(?)`,
      [adminFlag, args.email],
    );
    // UPDATE jest naturalnie idempotentny — powtórne wywołanie nie zmienia
    // stanu (affectedRows=1, changedRows=0). User w postal.users pojawia
    // się dopiero po pierwszym OIDC SSO (local_auth=false + SSO trigger
    // inserta z hashem Rails). Jeśli affected=0, user jeszcze się nie
    // zalogował — rola zostanie faktycznie zaaplikowana przy następnym
    // pełnym resyncu po first-login. Logujemy to jako warning, żeby
    // audytor wiedział, że przypisanie jest "pending".
    if (result.affectedRows === 0) {
      logger.warn("assignUserRole: no row updated (user not yet provisioned via OIDC first-login)", {
        email: args.email,
        desiredAdmin: adminFlag === 1,
      });
    }
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
    const [result] = await getPool().execute<mysql.ResultSetHeader>(
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
    if (result.affectedRows === 0) {
      logger.info("syncUserProfile: no row updated (user not yet provisioned)", {
        email: args.email,
        previousEmail: args.previousEmail,
      });
    }
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
