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

export interface ProfileSyncArgs {
  /** Aktualny email w Keycloak (source-of-truth). */
  email: string;
  /** Poprzedni email jeśli się zmienił (do lookup istniejącego rekordu). */
  previousEmail?: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Pełne imię i nazwisko (fallback gdy firstName/lastName puste). */
  displayName?: string | null;
  /** Numer telefonu (KC attribute `phoneNumber`). */
  phone?: string | null;
}

/**
 * Schema/version metadata raportowana przez providera. Używane przez
 * `/api/admin/iam/diagnostics/[provider]` i panel "Zarządzanie konfiguracją"
 * do wykrycia drift między wersją aplikacji natywnej a wersją interfejsu
 * w dashboardzie (np. nowa wersja Documenso z nową rolą).
 *
 * - `schemaVersion`: stabilny tag schematu po stronie providera (np. wersja
 *   API targetowanego przez tę implementację — `"v2"` dla Documenso v2).
 *   `"unknown"` jest dopuszczalne gdy provider nie potrafi tego ustalić.
 * - `nativeVersion`: wersja zwracana przez aplikację natywną (np. z
 *   `core_webservice_get_site_info` w Moodle, banner Chatwoota etc.).
 *   Optional — wymaga live request do app, więc nie każdy provider potrafi.
 */
export interface ProviderVersionInfo {
  schemaVersion: string;
  nativeVersion?: string;
}

/**
 * Kontrakt providera natywnego RBAC. Implementacja to single-instance per
 * aplikacja, instancjonowana lazy w `lib/permissions/registry.ts` (factory
 * pattern). Wszystkie metody są **idempotentne** chyba że JSDoc mówi inaczej.
 *
 * Konwencje błędów:
 *  - `ProviderNotConfiguredError` — brak wymaganych env vars (np. `*_DB_URL`).
 *    Rzucane przed I/O, callers powinni najpierw `isConfigured()`.
 *  - `ProviderUnsupportedError` — operacja nieobsługiwana przez aplikację
 *    natywną (np. `createRole` w Documenso które ma stałą enum).
 *  - Inne błędy (network, auth, permission po stronie app) propagują jako
 *    standardowe `Error` z message przyjaznym do logu.
 */
export interface PermissionProvider {
  /** Stabilne id (matches `nativeProviderId` w `areas.ts`). */
  readonly id: string;
  /** Ludzka nazwa do UI (PL). */
  readonly label: string;

  /**
   * Czy provider ma wszystkie env vars potrzebne do działania. Wywoływane
   * przed każdą operacją I/O i przy listowaniu providerów do panelu admin.
   * Musi być **synchronous, side-effect-free** — czyste sprawdzenie env.
   */
  isConfigured(): boolean;

  /**
   * Czy aplikacja pozwala na custom role (create/update/delete). False
   * oznacza że enum ról jest hardkodowany po stronie aplikacji natywnej
   * (Documenso, Postal). True → mogą być tworzone w app i live-fetchowane
   * przez `listRoles()` (Moodle, Chatwoot custom roles).
   */
  supportsCustomRoles(): boolean;

  /**
   * Live fetch listy capabilities z aplikacji docelowej. Zwraca pustą
   * tablicę gdy app nie eksponuje permission catalogu (np. Documenso —
   * permissions są domniemane z roli). Rzuca przy network/auth errorach.
   */
  listPermissions(): Promise<NativePermission[]>;

  /**
   * Live fetch listy ról z aplikacji docelowej. Zawsze zwraca przynajmniej
   * built-in role (system-defined). Custom role tylko gdy
   * `supportsCustomRoles()`. Rzuca przy network/auth errorach.
   *
   * Kolejność niezdefiniowana — caller powinien sortować po `priority`
   * (z area seedów) lub `name`.
   */
  listRoles(): Promise<NativeRole[]>;

  /**
   * Tworzy nową custom rolę w aplikacji natywnej. Rzuca
   * `ProviderUnsupportedError` gdy `!supportsCustomRoles()`. Rzuca też gdy
   * rola o tej nazwie już istnieje (caller robi pre-check przez `listRoles`).
   */
  createRole(args: {
    name: string;
    description?: string;
    permissions: string[];
  }): Promise<NativeRole>;

  /**
   * Aktualizuje custom rolę. Rzuca `ProviderUnsupportedError` gdy provider
   * nie wspiera, lub gdy `id` wskazuje na rolę system-defined.
   * Permissions są **replaced**, nie merge'owane.
   */
  updateRole(
    id: string,
    args: { name?: string; description?: string; permissions?: string[] },
  ): Promise<NativeRole>;

  /**
   * Usuwa custom rolę. Rzuca `ProviderUnsupportedError` dla system-defined.
   * Idempotentne — jeśli rola nie istnieje, no-op (nie throw).
   */
  deleteRole(id: string): Promise<void>;

  /**
   * Przypisuje rolę userowi w aplikacji natywnej. `roleId=null` →
   * usuwa wszystkie role (downgrade do default/no-access).
   *
   * **Idempotentne**: ponowne wywołanie z tą samą rolą jest no-op.
   * Tworzy usera jeśli nie istnieje (np. Documenso DB upsert).
   */
  assignUserRole(args: AssignUserRoleArgs): Promise<void>;

  /**
   * Aktualny id roli usera w aplikacji natywnej, lub null gdy user
   * nie istnieje albo nie ma żadnej roli. Nie throwa gdy user missing —
   * zwraca null (idempotentny lookup).
   */
  getUserRole(email: string): Promise<string | null>;

  /**
   * Synchronizuje dane profilowe usera (email, imię, nazwisko, telefon)
   * z Keycloak do aplikacji natywnej. Bez-op jeśli provider nie potrafi
   * zaktualizować danego pola. Używane przy zmianie profilu w KC.
   *
   * **Idempotentne**: wywołanie z tymi samymi wartościami nie zmienia
   * stanu. Gdy user nie istnieje w app — może go utworzyć (provider
   * decision) lub zwrócić bez akcji.
   */
  syncUserProfile(args: ProfileSyncArgs): Promise<void>;

  /**
   * Usuwa (lub deaktywuje) użytkownika z aplikacji natywnej. Wywoływane
   * gdy admin usuwa user'a z Keycloak — Keycloak jest source of truth,
   * więc brak go w KC = brak w żadnej aplikacji. Przyjmuje email zamiast id,
   * bo native systems mają własne user-id i email jest jedynym wspólnym
   * lookup keyem.
   *
   * Implementacje powinny być **idempotentne**: jeśli user już nie istnieje
   * w aplikacji, no-op (bez throwa). Failure tylko gdy aplikacja jest
   * dostępna ale operacja zwróciła błąd (network/auth/permission).
   *
   * Soft delete (suspend/archive) jest preferowany nad hard delete tam gdzie
   * aplikacja oferuje obie opcje — chroni audyt i historyczne dane (np.
   * komentarze w Outline, wiadomości w Chatwoot, podpisy w Documenso).
   */
  deleteUser(args: { email: string; previousEmail?: string }): Promise<void>;

  /**
   * Lista WSZYSTKICH user emails znanych przez aplikację natywną. Używane
   * przez reconcile job: sprawdzamy każdy email vs Keycloak i usuwamy te
   * których w KC nie ma (drift detection).
   *
   * Zwraca lowercase emails. Optional — provider który nie potrafi listować
   * może zwrócić `null` (skip w reconcile, log).
   */
  listUserEmails(): Promise<string[] | null>;

  /**
   * Wersja schematu/aplikacji natywnej. Używane przez panel diagnostyczny
   * do wykrycia drift między implementacją providera a aplikacją docelową
   * (np. provider targetuje API v2 ale app został zaktualizowany do v3).
   *
   * **Optional** — providery bez tej metody traktowane jako
   * `{ schemaVersion: "unknown" }`. Domyślna implementacja powinna zwracać
   * przynajmniej `schemaVersion`; `nativeVersion` jeśli wymaga live API
   * call to fine-to-skip gdy aplikacja niedostępna.
   *
   * **Side-effect-free** poza ewentualnym pojedynczym GET do app version
   * endpoint (z timeoutem!).
   */
  version?(): Promise<ProviderVersionInfo>;
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
