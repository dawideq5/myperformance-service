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

const logger = log.child({ module: "chatwoot-provider" });

/**
 * Chatwoot provider — integracja przez Platform API oraz Application API
 * (custom_roles). Rola systemowa ("agent"/"administrator") żyje w
 * `account_users.role` (via Platform API), custom role jest trzymana
 * w `account_users.custom_role_id` (Application API).
 *
 * Uprawnienia pobieramy dynamicznie:
 *   1. unikalne permissions ze wszystkich custom_roles aplikacji (deduped)
 *   2. uzupełnienie o baseline z docs Chatwoota (fallback) — oznaczone
 *      `origin: "baseline"` w UI nie jest potrzebne, bo UI pokazuje po
 *      prostu wszystkie jakie widzi.
 */

interface Config {
  baseUrl: string;
  platformToken: string;
  accountId: number;
}

function getConfig(): Config {
  const baseUrl = getOptionalEnv("CHATWOOT_URL").replace(/\/$/, "");
  const platformToken = getOptionalEnv("CHATWOOT_PLATFORM_TOKEN");
  const accountId = Number(getOptionalEnv("CHATWOOT_ACCOUNT_ID") || "1");
  if (!baseUrl || !platformToken) {
    throw new ProviderNotConfiguredError("chatwoot");
  }
  return { baseUrl, platformToken, accountId };
}

async function platformFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cfg = getConfig();
  return fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      api_access_token: cfg.platformToken,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

interface ChatwootCustomRoleRaw {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  account_id?: number;
}

interface ChatwootUser {
  id: number;
  email: string;
  name?: string;
  accounts?: Array<{
    account_id: number;
    role: "administrator" | "agent";
    custom_role_id?: number | null;
  }>;
}

/**
 * Baseline znanych uprawnień Chatwoota — uzupełnia live-fetched listę gdy
 * aplikacja nie ma jeszcze custom_roles. Nie wpływa na logikę przypisywania
 * — po stronie Chatwoota listę akceptowanych kluczy waliduje API.
 */
const BASELINE_PERMISSIONS: NativePermission[] = [
  { key: "conversation_manage", label: "Zarządzanie rozmowami (wszystkie)", group: "Rozmowy" },
  {
    key: "conversation_unassigned_manage",
    label: "Rozmowy nieprzypisane",
    group: "Rozmowy",
  },
  {
    key: "conversation_participating_manage",
    label: "Rozmowy z Twoim udziałem",
    group: "Rozmowy",
  },
  { key: "contact_manage", label: "Zarządzanie kontaktami", group: "Kontakty" },
  { key: "report_manage", label: "Dostęp do raportów", group: "Raporty" },
  { key: "knowledge_base_manage", label: "Baza wiedzy Chatwoot", group: "Pomoc" },
];

function humanizePermission(key: string): NativePermission {
  const group = key.startsWith("conversation_")
    ? "Rozmowy"
    : key.startsWith("contact_")
      ? "Kontakty"
      : key.startsWith("report_")
        ? "Raporty"
        : key.startsWith("knowledge_base")
          ? "Pomoc"
          : "Inne";
  const label = key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { key, label, group };
}

export class ChatwootProvider implements PermissionProvider {
  readonly id = "chatwoot";
  readonly label = "Chatwoot";

  isConfigured(): boolean {
    try {
      getConfig();
      return true;
    } catch {
      return false;
    }
  }

  supportsCustomRoles(): boolean {
    // Custom role definiuje się w Chatwoot UI → Settings → Custom Roles.
    // Dashboard jest tylko access gate (agent vs administrator).
    return false;
  }

  async listPermissions(): Promise<NativePermission[]> {
    // Deduped union: baseline + whatever we see across existing custom_roles.
    const seen = new Map<string, NativePermission>();
    for (const p of BASELINE_PERMISSIONS) seen.set(p.key, p);
    if (this.isConfigured()) {
      try {
        const roles = await this.fetchRawCustomRoles();
        for (const r of roles) {
          for (const key of r.permissions ?? []) {
            if (!seen.has(key)) seen.set(key, humanizePermission(key));
          }
        }
      } catch {
        // Nie przerywamy — baseline wystarczy do edycji.
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.group === b.group ? a.label.localeCompare(b.label) : a.group.localeCompare(b.group),
    );
  }

  async listRoles(): Promise<NativeRole[]> {
    if (!this.isConfigured()) return [];
    const system: NativeRole[] = [
      {
        id: "agent",
        name: "Agent",
        description: "Rola systemowa Chatwoot: obsługa rozmów w granicach własnych zespołów.",
        permissions: [],
        systemDefined: true,
        userCount: null,
      },
      {
        id: "administrator",
        name: "Administrator",
        description: "Rola systemowa Chatwoot: pełne uprawnienia konta.",
        permissions: [],
        systemDefined: true,
        userCount: null,
      },
    ];
    const custom = await this.fetchRawCustomRoles().catch(() => [] as ChatwootCustomRoleRaw[]);
    const customRoles: NativeRole[] = custom.map((r) => ({
      id: String(r.id),
      name: r.name,
      description: r.description ?? undefined,
      permissions: r.permissions ?? [],
      systemDefined: false,
      userCount: null,
    }));
    return [...system, ...customRoles];
  }

  private async fetchRawCustomRoles(): Promise<ChatwootCustomRoleRaw[]> {
    const cfg = getConfig();
    const res = await platformFetch(`/api/v1/accounts/${cfg.accountId}/custom_roles`);
    if (!res.ok) {
      throw new Error(`Chatwoot custom_roles list failed: ${res.status}`);
    }
    const raw = (await res.json()) as
      | ChatwootCustomRoleRaw[]
      | { data?: ChatwootCustomRoleRaw[] };
    return Array.isArray(raw) ? raw : raw.data ?? [];
  }

  async createRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError("chatwoot", "createRole");
  }

  async updateRole(): Promise<NativeRole> {
    throw new ProviderUnsupportedError("chatwoot", "updateRole");
  }

  async deleteRole(): Promise<void> {
    throw new ProviderUnsupportedError("chatwoot", "deleteRole");
  }

  async assignUserRole(args: AssignUserRoleArgs): Promise<void> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError("chatwoot");
    const cfg = getConfig();
    const user = await this.findOrCreateUser(args.email, args.displayName);

    // Ustal pożądany stan (system role + optional custom_role_id).
    const isSystemAgent = args.roleId === "agent";
    const isSystemAdmin = args.roleId === "administrator";
    const systemRole: "agent" | "administrator" = isSystemAdmin ? "administrator" : "agent";
    const customRoleId =
      args.roleId && !isSystemAgent && !isSystemAdmin ? Number(args.roleId) : null;

    // Jeśli roleId === null → odbieramy członkostwo w account_users.
    if (args.roleId === null) {
      const del = await platformFetch(
        `/platform/api/v1/accounts/${cfg.accountId}/account_users`,
        { method: "DELETE", body: JSON.stringify({ user_id: user.id }) },
      );
      if (!del.ok && del.status !== 404) {
        throw new Error(`Chatwoot drop membership failed: ${del.status}`);
      }
      return;
    }

    // Upsert — API Platform nie ma UPDATE, więc drop + create.
    await platformFetch(`/platform/api/v1/accounts/${cfg.accountId}/account_users`, {
      method: "DELETE",
      body: JSON.stringify({ user_id: user.id }),
    });
    const create = await platformFetch(
      `/platform/api/v1/accounts/${cfg.accountId}/account_users`,
      {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          role: systemRole,
          ...(customRoleId !== null ? { custom_role_id: customRoleId } : {}),
        }),
      },
    );
    if (!create.ok && create.status !== 422) {
      throw new Error(`Chatwoot account membership failed: ${create.status}`);
    }
  }

  async getUserRole(email: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const user = await this.findUser(email);
    if (!user) return null;
    const cfg = getConfig();
    const membership = (user.accounts ?? []).find((a) => a.account_id === cfg.accountId);
    if (!membership) return null;
    if (membership.custom_role_id) return String(membership.custom_role_id);
    return membership.role;
  }

  async syncUserProfile(args: ProfileSyncArgs): Promise<void> {
    if (!this.isConfigured()) return;
    const lookup = args.previousEmail ?? args.email;
    const user = await this.findUser(lookup);
    if (!user) {
      logger.info("syncUserProfile: user not found in chatwoot", {
        email: lookup,
      });
      return;
    }
    const patch: Record<string, string> = {};
    const fullName =
      [args.firstName, args.lastName].filter(Boolean).join(" ").trim() ||
      args.displayName ||
      "";
    if (fullName && fullName !== user.name) patch.name = fullName;
    if (
      args.email &&
      args.email.toLowerCase() !== (user.email ?? "").toLowerCase()
    ) {
      patch.email = args.email;
    }
    // Chatwoot User nie trzyma telefonu (numery są na poziomie Contact).
    if (Object.keys(patch).length === 0) return;

    // Chatwoot Platform API w v4+ preferuje PUT. Starsze wersje akceptują
    // PATCH. Próbujemy PUT jako pierwszy (szerzej zaimplementowany), po
    // failu (405/404) → PATCH. Oba wyniki logowane żeby admin widział
    // konkretny błąd w audit log.
    let res = await platformFetch(`/platform/api/v1/users/${user.id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    if (res.status === 405 || res.status === 404) {
      const fallback = await platformFetch(
        `/platform/api/v1/users/${user.id}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      if (fallback.ok) {
        logger.info("syncUserProfile: PATCH fallback OK", {
          userId: user.id,
          fields: Object.keys(patch),
        });
        return;
      }
      res = fallback;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = `Chatwoot syncUserProfile ${user.id} failed: ${res.status} ${body.slice(0, 200)}`;
      logger.error("syncUserProfile failed", {
        userId: user.id,
        status: res.status,
        fields: Object.keys(patch),
        body: body.slice(0, 200),
      });
      throw new Error(err);
    }
    logger.info("syncUserProfile OK", {
      userId: user.id,
      fields: Object.keys(patch),
    });
  }

  async deleteUser(args: { email: string; previousEmail?: string }): Promise<void> {
    if (!this.isConfigured()) return;
    const lookup = args.previousEmail ?? args.email;
    const user = await this.findUser(lookup);
    if (!user) return;
    // Chatwoot Platform API: DELETE /platform/api/v1/users/{id} — hard delete.
    // Wcześniej musimy usunąć user-a ze wszystkich account_users (Chatwoot
    // odrzuci hard delete gdy user należy do account-u). Iterujemy po
    // accountach i usuwamy membership.
    const memberships = await this.listUserAccounts(user.id);
    for (const m of memberships) {
      await platformFetch(
        `/platform/api/v1/accounts/${m.account_id}/account_users`,
        {
          method: "DELETE",
          body: JSON.stringify({ user_id: user.id }),
        },
      ).catch(() => {
        // best-effort — final DELETE i tak by zwrócił błąd, który złapiemy
      });
    }
    const res = await platformFetch(`/platform/api/v1/users/${user.id}`, {
      method: "DELETE",
    });
    if (res.status === 404) return; // już usunięty
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Chatwoot deleteUser ${user.id} failed: ${res.status} ${body.slice(0, 200)}`,
      );
    }
    logger.info("deleteUser OK", { userId: user.id, email: lookup });
  }

  async listUserEmails(): Promise<string[] | null> {
    if (!this.isConfigured()) return null;
    const out: string[] = [];
    for (let page = 1; page <= 100; page++) {
      const res = await platformFetch(`/platform/api/v1/users?page=${page}`);
      if (res.status === 404) break;
      if (!res.ok) return null;
      const data = (await res.json()) as
        | ChatwootUser[]
        | { data?: ChatwootUser[]; payload?: ChatwootUser[] };
      const list = Array.isArray(data)
        ? data
        : (data.data ?? data.payload ?? []);
      if (list.length === 0) break;
      for (const u of list) {
        if (u.email) out.push(u.email.toLowerCase());
      }
      if (list.length < 15) break; // Chatwoot default page size
    }
    return out;
  }

  private async listUserAccounts(
    userId: number,
  ): Promise<Array<{ account_id: number }>> {
    try {
      const res = await platformFetch(
        `/platform/api/v1/users/${userId}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        accounts?: Array<{ id?: number; account_id?: number }>;
      };
      return (data.accounts ?? [])
        .map((a) => ({ account_id: a.account_id ?? a.id ?? 0 }))
        .filter((a) => a.account_id > 0);
    } catch {
      return [];
    }
  }

  /**
   * Chatwoot Platform API **nie** wspiera `?q=email` search. Musimy
   * paginować `/platform/api/v1/users` i filtrować lokalnie. Limit
   * domyślny Chatwoota = 15 na stronę, przebiegamy do 100 stron (1500
   * userów) — dla instancji z większą liczbą Chatwoot wymaga plików
   * mapping-owych (poza zakresem dashboardu).
   */
  private async findUser(email: string): Promise<ChatwootUser | null> {
    const target = email.toLowerCase();
    for (let page = 1; page <= 100; page++) {
      const res = await platformFetch(`/platform/api/v1/users?page=${page}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        logger.warn("findUser: list failed", { page, status: res.status });
        return null;
      }
      const data = (await res.json()) as
        | ChatwootUser[]
        | { data?: ChatwootUser[]; payload?: ChatwootUser[] };
      const list = Array.isArray(data)
        ? data
        : data.data ?? data.payload ?? [];
      if (list.length === 0) return null;
      const match = list.find(
        (u) => (u.email ?? "").toLowerCase() === target,
      );
      if (match) {
        // Pełne szczegóły (membership) — listing zwraca tylko krótką formę.
        const detail = await platformFetch(
          `/platform/api/v1/users/${match.id}`,
        );
        if (detail.ok) return (await detail.json()) as ChatwootUser;
        return match;
      }
      // Heurystyka: jeśli page zwrócił mniej niż pełen zestaw (np. <15)
      // to ostatnia strona — kończymy.
      if (list.length < 15) return null;
    }
    return null;
  }

  private async findOrCreateUser(
    email: string,
    displayName: string,
  ): Promise<ChatwootUser> {
    const existing = await this.findUser(email);
    if (existing) return existing;
    // Chatwoot wymusza politykę hasła: min. 1 wielka, 1 mała, 1 cyfra, 1 znak
    // specjalny. Hex sam w sobie nie spełnia tych warunków.
    const password = generateStrongPassword();
    const res = await platformFetch(`/platform/api/v1/users`, {
      method: "POST",
      body: JSON.stringify({
        name: displayName || email,
        email,
        password,
        custom_attributes: { source: "keycloak-sso" },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Chatwoot create user failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return (await res.json()) as ChatwootUser;
  }
}

/**
 * 24-znakowe hasło spełniające politykę Chatwoot (upper, lower, digit,
 * special). User nigdy się nim nie loguje — konto Chatwoot jest tylko
 * proxy, autoryzacja idzie przez SSO.
 */
function generateStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const special = "!@#$%^&*()_+-=";
  const all = upper + lower + digit + special;

  const pick = (set: string) => {
    const i = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * set.length);
    return set[i];
  };

  const required = [pick(upper), pick(lower), pick(digit), pick(special)];
  const rest = Array.from({ length: 20 }, () => pick(all));
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle — uniknij przewidywalnych pozycji wymaganych klas.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(
      (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (i + 1),
    );
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
