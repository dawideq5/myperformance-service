import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";
import { appendIamAudit } from "./db";
import {
  AREAS,
  kcGroupNameForArea,
  kcRoleNameForDynamicRole,
  type AreaRoleSeed,
  type PermissionArea,
} from "./areas";
import { getProvider } from "./registry";

/**
 * Enterprise KC synchronizacja — idempotentny bootstrap + reconcile.
 *
 * Co robi:
 *   1. Dla każdego `AREAS[*].kcRoles[*]` — tworzy realm role w KC
 *      (jeśli nie istnieje), ustawia/aktualizuje description i atrybuty
 *      (`areaId`, `nativeRoleId`, `priority`, `label`, `seed`=`true`).
 *   2. Dla każdego area z `dynamicRoles=true` — wywołuje
 *      `provider.listRoles()` i dla każdej roli natywnej tworzy realm
 *      role `<areaId>_<nativeRoleId>` z atrybutem `seed=false`.
 *   3. Dla każdego area tworzy composite group `app-<areaId>` z realm
 *      roles tej apki — dzięki temu admini mogą nadawać uprawnienia
 *      również poprzez dodanie usera do grupy w KC Console (enterprise
 *      group-based RBAC).
 *   4. Usuwa realm roles, których już nie ma w specyfikacji
 *      (match po prefiksie `<areaId>_`).
 *
 * Wywoływane:
 *   - przy starcie serwera (background, non-fatal — błąd loguje się),
 *   - manualnie: `POST /api/admin/iam/sync-kc`,
 *   - przed `assignUserAreaRole` gdy docelowa rola to dynamic-role nie
 *     zarejestrowana jeszcze w KC (just-in-time ensureRealmRole).
 */

const logger = log.child({ module: "kc-sync" });

type RoleRepresentation = {
  id: string;
  name: string;
  description?: string;
  attributes?: Record<string, string[]>;
  composite?: boolean;
};

type GroupRepresentation = {
  id: string;
  name: string;
  realmRoles?: string[];
  subGroups?: GroupRepresentation[];
};

export interface SyncResult {
  rolesCreated: number;
  rolesUpdated: number;
  rolesDeleted: number;
  groupsCreated: number;
  groupsUpdated: number;
  errors: Array<{ step: string; name: string; error: string }>;
  dynamicRolesByArea: Record<string, string[]>;
}

/** Lokalne — zapobiega wielokrotnemu równoległemu bootstrapowi. */
let inflight: Promise<SyncResult> | null = null;

export async function syncAreasToKeycloak(opts?: {
  actor?: string;
  deleteStale?: boolean;
}): Promise<SyncResult> {
  if (inflight) return inflight;
  inflight = doSync(opts).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doSync(opts?: {
  actor?: string;
  deleteStale?: boolean;
}): Promise<SyncResult> {
  const actor = opts?.actor ?? "system:kc-sync";
  const deleteStale = opts?.deleteStale ?? false;
  const result: SyncResult = {
    rolesCreated: 0,
    rolesUpdated: 0,
    rolesDeleted: 0,
    groupsCreated: 0,
    groupsUpdated: 0,
    errors: [],
    dynamicRolesByArea: {},
  };

  const token = await keycloak.getServiceAccountToken();

  // 1. Zbierz docelowy zestaw ról: seedy + provider-dynamic.
  const targetRoles: Array<{
    area: PermissionArea;
    name: string;
    description: string;
    label: string;
    priority: number;
    nativeRoleId: string | null;
    seed: boolean;
  }> = [];

  for (const area of AREAS) {
    for (const seed of area.kcRoles) {
      targetRoles.push(roleFromSeed(area, seed, true));
    }
    if (area.dynamicRoles && area.provider === "native") {
      const provider = getProvider(area.nativeProviderId);
      if (provider && provider.isConfigured()) {
        try {
          const native = await provider.listRoles();
          const dyn: string[] = [];
          for (const nr of native) {
            const kcName = kcRoleNameForDynamicRole(area, nr.id);
            dyn.push(kcName);
            // Jeśli seed już zadeklarował tę rolę (po nazwie), pomijamy —
            // seed wins co do labela/priority.
            if (targetRoles.some((t) => t.name === kcName)) continue;
            targetRoles.push({
              area,
              name: kcName,
              description: nr.description ?? nr.name,
              label: nr.name,
              priority: 20,
              nativeRoleId: nr.id,
              seed: false,
            });
          }
          result.dynamicRolesByArea[area.id] = dyn;
        } catch (err) {
          result.errors.push({
            step: "provider.listRoles",
            name: area.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  // 2. Pobierz obecny zestaw realm roles i zbuduj mapę.
  const existingRoles = await listRealmRoles(token);
  const existingByName = new Map(existingRoles.map((r) => [r.name, r]));

  // 3. Upsert target.
  for (const t of targetRoles) {
    try {
      const existing = existingByName.get(t.name);
      const wantAttrs: Record<string, string[]> = {
        areaId: [t.area.id],
        label: [t.label],
        priority: [String(t.priority)],
        seed: [t.seed ? "true" : "false"],
      };
      if (t.nativeRoleId) wantAttrs.nativeRoleId = [t.nativeRoleId];

      if (!existing) {
        const ok = await createRole(token, {
          name: t.name,
          description: t.description,
          attributes: wantAttrs,
        });
        if (ok) result.rolesCreated++;
      } else {
        const needsUpdate =
          existing.description !== t.description ||
          !attrsEqual(existing.attributes ?? {}, wantAttrs);
        if (needsUpdate) {
          await updateRole(token, existing.id, {
            ...existing,
            description: t.description,
            attributes: wantAttrs,
          });
          result.rolesUpdated++;
        }
      }
    } catch (err) {
      result.errors.push({
        step: "role.upsert",
        name: t.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. Usuń stale role: mają atrybut areaId, ale nie są w targetRoles.
  if (deleteStale) {
    const targetNames = new Set(targetRoles.map((t) => t.name));
    for (const existing of existingRoles) {
      const areaIdAttr = existing.attributes?.areaId?.[0];
      if (!areaIdAttr) continue; // nie nasze
      if (targetNames.has(existing.name)) continue;
      try {
        await deleteRole(token, existing.name);
        result.rolesDeleted++;
      } catch (err) {
        result.errors.push({
          step: "role.delete",
          name: existing.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 5. Composite `app-<areaId>` groups — POMINIĘTE (2026-04-25).
  // Wcześniej kc-sync auto-tworzył per-area composite group jako convenience
  // mapping, ale admin nie widział wartości i zaśmiecało listę grup
  // w `/admin/users` → tab "Grupy". Grupy tworzy admin ręcznie (Administrator,
  // Sprzedawca, itd.) — żadnych auto-generated app-* groups.

  await appendIamAudit({
    actor,
    operation: "kc.sync",
    targetType: "realm",
    targetId: "*",
    status: result.errors.length === 0 ? "ok" : "error",
    details: {
      rolesCreated: result.rolesCreated,
      rolesUpdated: result.rolesUpdated,
      rolesDeleted: result.rolesDeleted,
      groupsCreated: result.groupsCreated,
      groupsUpdated: result.groupsUpdated,
      errorCount: result.errors.length,
      dynamicRolesByArea: result.dynamicRolesByArea,
    },
    error: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
  });

  logger.info("kc-sync completed", {
    ...result,
    errorCount: result.errors.length,
  });

  return result;
}

function roleFromSeed(
  area: PermissionArea,
  seed: AreaRoleSeed,
  isSeed: boolean,
): {
  area: PermissionArea;
  name: string;
  description: string;
  label: string;
  priority: number;
  nativeRoleId: string | null;
  seed: boolean;
} {
  return {
    area,
    name: seed.name,
    description: seed.description,
    label: seed.label,
    priority: seed.priority,
    nativeRoleId: seed.nativeRoleId ?? null,
    seed: isSeed,
  };
}

/**
 * Ensure pojedynczej realm role — używane JIT przy przypisywaniu roli
 * dynamicznej (Moodle), gdy pełny sync jeszcze się nie odbył lub rola
 * pojawiła się po ostatnim sync-u.
 */
export async function ensureRealmRoleFromArea(
  areaId: string,
  nativeRoleId: string,
  opts?: { label?: string; description?: string; priority?: number },
): Promise<string> {
  const area = AREAS.find((a) => a.id === areaId);
  if (!area) throw new Error(`ensureRealmRoleFromArea: unknown area ${areaId}`);
  const name = kcRoleNameForDynamicRole(area, nativeRoleId);
  const token = await keycloak.getServiceAccountToken();
  const existing = await fetchRoleByName(token, name);
  const attrs: Record<string, string[]> = {
    areaId: [areaId],
    label: [opts?.label ?? nativeRoleId],
    priority: [String(opts?.priority ?? 20)],
    seed: ["false"],
    nativeRoleId: [nativeRoleId],
  };
  if (!existing) {
    await createRole(token, {
      name,
      description: opts?.description ?? `Moodle role ${nativeRoleId}`,
      attributes: attrs,
    });
    await ensureRoleInAreaGroup(token, area, name);
    return name;
  }
  if (!attrsEqual(existing.attributes ?? {}, attrs)) {
    await updateRole(token, existing.id, {
      ...existing,
      description: opts?.description ?? existing.description ?? name,
      attributes: attrs,
    });
  }
  await ensureRoleInAreaGroup(token, area, name);
  return name;
}

async function ensureRoleInAreaGroup(
  token: string,
  area: PermissionArea,
  roleName: string,
): Promise<void> {
  const groupName = kcGroupNameForArea(area);
  const groups = await listTopLevelGroups(token);
  let group = groups.find((g) => g.name === groupName);
  if (!group) {
    group = await createGroup(token, {
      name: groupName,
      attributes: { areaId: [area.id], managedBy: ["kc-sync"] },
    });
  }
  const current = await getGroupRealmRoles(token, group.id);
  if (current.some((r) => r.name === roleName)) return;
  const role = await fetchRoleByName(token, roleName);
  if (!role) return;
  await addGroupRealmRoles(token, group.id, [role]);
}

// ── KC Admin API helpers ──────────────────────────────────────────────────

async function listRealmRoles(token: string): Promise<RoleRepresentation[]> {
  const res = await keycloak.adminRequest(
    "/roles?briefRepresentation=false&max=500",
    token,
  );
  if (!res.ok) throw new Error(`listRealmRoles: ${res.status}`);
  return (await res.json()) as RoleRepresentation[];
}

async function fetchRoleByName(
  token: string,
  name: string,
): Promise<RoleRepresentation | null> {
  const res = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(name)}?briefRepresentation=false`,
    token,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchRoleByName(${name}): ${res.status}`);
  return (await res.json()) as RoleRepresentation;
}

async function createRole(
  token: string,
  payload: {
    name: string;
    description?: string;
    attributes?: Record<string, string[]>;
  },
): Promise<boolean> {
  const res = await keycloak.adminRequest("/roles", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (res.ok) return true;
  if (res.status === 409) return false;
  const body = await res.text().catch(() => "");
  throw new Error(`createRole(${payload.name}): ${res.status} ${body.slice(0, 200)}`);
}

async function updateRole(
  token: string,
  roleId: string,
  payload: RoleRepresentation & {
    description?: string;
    attributes?: Record<string, string[]>;
  },
): Promise<void> {
  const res = await keycloak.adminRequest(
    `/roles-by-id/${encodeURIComponent(roleId)}`,
    token,
    { method: "PUT", body: JSON.stringify(payload) },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`updateRole(${payload.name}): ${res.status} ${body.slice(0, 200)}`);
  }
}

async function deleteRole(token: string, name: string): Promise<void> {
  const res = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(name)}`,
    token,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`deleteRole(${name}): ${res.status} ${body.slice(0, 200)}`);
  }
}

async function listTopLevelGroups(
  token: string,
): Promise<GroupRepresentation[]> {
  const res = await keycloak.adminRequest(
    "/groups?briefRepresentation=false&max=500",
    token,
  );
  if (!res.ok) throw new Error(`listTopLevelGroups: ${res.status}`);
  return (await res.json()) as GroupRepresentation[];
}

async function createGroup(
  token: string,
  payload: { name: string; attributes?: Record<string, string[]> },
): Promise<GroupRepresentation> {
  const res = await keycloak.adminRequest("/groups", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 409) {
    const body = await res.text().catch(() => "");
    throw new Error(`createGroup(${payload.name}): ${res.status} ${body.slice(0, 200)}`);
  }
  // Refetch — KC nie zwraca body na POST /groups.
  const list = await listTopLevelGroups(token);
  const match = list.find((g) => g.name === payload.name);
  if (!match) throw new Error(`createGroup(${payload.name}): not found after create`);
  return match;
}

async function getGroupRealmRoles(
  token: string,
  groupId: string,
): Promise<RoleRepresentation[]> {
  const res = await keycloak.adminRequest(
    `/groups/${encodeURIComponent(groupId)}/role-mappings/realm`,
    token,
  );
  if (!res.ok) throw new Error(`getGroupRealmRoles(${groupId}): ${res.status}`);
  return (await res.json()) as RoleRepresentation[];
}

async function addGroupRealmRoles(
  token: string,
  groupId: string,
  roles: RoleRepresentation[],
): Promise<void> {
  if (roles.length === 0) return;
  const res = await keycloak.adminRequest(
    `/groups/${encodeURIComponent(groupId)}/role-mappings/realm`,
    token,
    { method: "POST", body: JSON.stringify(roles) },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`addGroupRealmRoles: ${res.status} ${body.slice(0, 200)}`);
  }
}

async function removeGroupRealmRoles(
  token: string,
  groupId: string,
  roles: RoleRepresentation[],
): Promise<void> {
  if (roles.length === 0) return;
  const res = await keycloak.adminRequest(
    `/groups/${encodeURIComponent(groupId)}/role-mappings/realm`,
    token,
    { method: "DELETE", body: JSON.stringify(roles) },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`removeGroupRealmRoles: ${res.status} ${body.slice(0, 200)}`);
  }
}

function attrsEqual(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.join(",") !== bKeys.join(",")) return false;
  for (const k of aKeys) {
    const av = [...(a[k] ?? [])].sort();
    const bv = [...(b[k] ?? [])].sort();
    if (av.length !== bv.length) return false;
    for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
  }
  return true;
}

// ── Startup hook ──────────────────────────────────────────────────────────

let startupSyncFired = false;

/**
 * Non-blocking, fire-and-forget bootstrap sync. Bezpieczny do wywołania
 * wielokrotnie (deduplikacja przez `startupSyncFired` + `inflight`).
 *
 * Ustawione `deleteStale: true` — realm roles z atrybutem `areaId` które
 * nie występują już w seed ani w provider.listRoles() są kasowane. Dzięki
 * temu gdy admin zmieni nazwę Moodle roli (test123 → test12345) albo ją
 * usunie, KC nie zostaje z "martwą" rolą moodle_test123.
 * Role bez `areaId` (np. `admin`, `manage_users`, panele) są nietykalne.
 */
export function scheduleStartupKcSync(): void {
  if (startupSyncFired) return;
  startupSyncFired = true;
  // Drobny delay — czekamy aż Next się rozgrzeje, żeby bootstrap DB i
  // innych ecnnectorów nie walczył o token.
  setTimeout(() => {
    syncAreasToKeycloak({ actor: "system:startup", deleteStale: true })
      .then((r) => {
        logger.info("startup kc-sync finished", {
          rolesCreated: r.rolesCreated,
          rolesUpdated: r.rolesUpdated,
          groupsCreated: r.groupsCreated,
          errorCount: r.errors.length,
        });
      })
      .catch((err: unknown) => {
        logger.warn("startup kc-sync failed (non-fatal)", {
          err: err instanceof Error ? err.message : String(err),
        });
      });
  }, 5000);
}
