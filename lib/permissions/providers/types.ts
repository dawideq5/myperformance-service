/**
 * Wspólny kontrakt integracji z natywnymi systemami ról/uprawnień.
 *
 * Każda aplikacja z własnym RBAC (Chatwoot, Moodle, Directus, ...)
 * implementuje ten interfejs. Cała lista uprawnień/ról jest pobierana
 * dynamicznie z docelowego systemu — nigdy nie hardkodujemy capabilities
 * w dashboardzie, żeby aktualizacje aplikacji nie psuły panelu.
 */

export interface NativeRole {
  /** Stabilne id z aplikacji natywnej. */
  id: string;
  /** Ludzka nazwa (widoczna w UI). */
  name: string;
  description?: string;
  /** Klucze uprawnień wg konwencji aplikacji (np. `conversation_manage`). */
  permissions: string[];
  /**
   * True dla ról wbudowanych w aplikację (np. `administrator` Chatwoota,
   * `manager` Moodla). Tych nie można usunąć ani edytować.
   */
  systemDefined?: boolean;
  /**
   * Liczba użytkowników aplikacji z tą rolą. `null` gdy provider nie potrafi
   * tego policzyć (np. bez listowania membership).
   */
  userCount?: number | null;
}

export interface NativePermission {
  key: string;
  label: string;
  group: string;
  description?: string;
}

export interface AssignUserRoleArgs {
  email: string;
  displayName: string;
  /** Natywny role id lub `null` gdy odbieramy wszystkie role w aplikacji. */
  roleId: string | null;
}

export interface PermissionProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;

  /** Czy aplikacja pozwala na custom role (create/update/delete). */
  supportsCustomRoles(): boolean;

  /** Live fetch listy capabilities z aplikacji docelowej. */
  listPermissions(): Promise<NativePermission[]>;

  /** Live fetch listy ról z aplikacji docelowej. */
  listRoles(): Promise<NativeRole[]>;

  /** Rzuca gdy !supportsCustomRoles. */
  createRole(args: {
    name: string;
    description?: string;
    permissions: string[];
  }): Promise<NativeRole>;

  updateRole(
    id: string,
    args: { name?: string; description?: string; permissions?: string[] },
  ): Promise<NativeRole>;

  deleteRole(id: string): Promise<void>;

  assignUserRole(args: AssignUserRoleArgs): Promise<void>;

  /** Aktualny id roli usera w aplikacji natywnej, lub null. */
  getUserRole(email: string): Promise<string | null>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerId: string) {
    super(`Provider ${providerId} is not configured`);
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderUnsupportedError extends Error {
  constructor(providerId: string, operation: string) {
    super(`Provider ${providerId} does not support ${operation}`);
    this.name = "ProviderUnsupportedError";
  }
}
