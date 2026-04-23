import { keycloak } from "@/lib/keycloak";
import {
  AREAS,
  findAreaForRole,
  getArea,
  listAreaKcRoleNames,
  type PermissionArea,
} from "./areas";
import { getProvider } from "./registry";
import { syncDocumensoUserRole } from "@/lib/documenso";

/**
 * Orchestrator przypisywania ról per-area.
 *
 * Reguły:
 *   1. User może mieć co najwyżej jedną rolę z `area.kcRoles` równocześnie.
 *   2. Przy ustawianiu nowej roli w area: usuwamy wszystkie inne role z
 *      `area.kcRoles`, dodajemy nową (idempotentnie).
 *   3. Jeśli `area.provider === "native"`: po udanej zmianie w KC
 *      wywołujemy `provider.assignUserRole` z natywnym role id
 *      (resolved po konwencji seed lub custom role).
 */

export interface RoleRepresentation {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
  attributes?: Record<string, string[]>;
}

interface KcUser {
  id: string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, string[] | undefined>;
}

function getPhone(u: KcUser): string | null {
  const v = u.attributes?.phoneNumber?.[0] ?? u.attributes?.phone?.[0];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function listAllRealmRoles(adminToken: string): Promise<RoleRepresentation[]> {
  const res = await keycloak.adminRequest(
    "/roles?briefRepresentation=false&max=500",
    adminToken,
  );
  if (!res.ok) {
    throw new Error(`listAllRealmRoles failed: ${res.status}`);
  }
  return (await res.json()) as RoleRepresentation[];
}

async function listUserRealmRoles(
  adminToken: string,
  userId: string,
): Promise<RoleRepresentation[]> {
  const res = await keycloak.adminRequest(
    `/users/${userId}/role-mappings/realm`,
    adminToken,
  );
  if (!res.ok) {
    throw new Error(`listUserRealmRoles ${userId} failed: ${res.status}`);
  }
  return (await res.json()) as RoleRepresentation[];
}

async function getKcUser(adminToken: string, userId: string): Promise<KcUser> {
  // `userProfileMetadata=true` wymusza zwrócenie pełnego `attributes` (w tym
  // phoneNumber), które domyślnie jest pomijane w Keycloak 26.x.
  const res = await keycloak.adminRequest(
    `/users/${userId}?userProfileMetadata=true`,
    adminToken,
  );
  if (!res.ok) {
    throw new Error(`getKcUser ${userId} failed: ${res.status}`);
  }
  return (await res.json()) as KcUser;
}

async function ensureRealmRoleExists(
  adminToken: string,
  name: string,
  description?: string,
): Promise<RoleRepresentation> {
  const existing = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(name)}`,
    adminToken,
  );
  if (existing.ok) {
    return (await existing.json()) as RoleRepresentation;
  }
  if (existing.status !== 404) {
    throw new Error(`probe role ${name} failed: ${existing.status}`);
  }
  const create = await keycloak.adminRequest(`/roles`, adminToken, {
    method: "POST",
    body: JSON.stringify({ name, description: description ?? "" }),
  });
  if (!create.ok && create.status !== 409) {
    throw new Error(`create role ${name} failed: ${create.status}`);
  }
  const fetched = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(name)}`,
    adminToken,
  );
  if (!fetched.ok) throw new Error(`fetch role ${name} failed: ${fetched.status}`);
  return (await fetched.json()) as RoleRepresentation;
}

async function addRolesToUser(
  adminToken: string,
  userId: string,
  roles: RoleRepresentation[],
): Promise<void> {
  if (roles.length === 0) return;
  const res = await keycloak.adminRequest(
    `/users/${userId}/role-mappings/realm`,
    adminToken,
    { method: "POST", body: JSON.stringify(roles) },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`addRolesToUser failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

async function removeRolesFromUser(
  adminToken: string,
  userId: string,
  roles: RoleRepresentation[],
): Promise<void> {
  if (roles.length === 0) return;
  const res = await keycloak.adminRequest(
    `/users/${userId}/role-mappings/realm`,
    adminToken,
    { method: "DELETE", body: JSON.stringify(roles) },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`removeRolesFromUser failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

/**
 * Policzenie userów z daną realm rolą (przez users/by role). Używane w UI.
 */
export async function countUsersWithRole(
  adminToken: string,
  roleName: string,
): Promise<number> {
  const res = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(roleName)}/users/count`,
    adminToken,
  );
  if (res.ok) {
    const data = (await res.json()) as { count?: number } | number;
    if (typeof data === "number") return data;
    if (typeof data === "object" && data && "count" in data) return Number(data.count ?? 0);
  }
  // Fallback — niektóre wersje KC nie mają /count, listujemy max=200.
  const fallback = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(roleName)}/users?first=0&max=200`,
    adminToken,
  );
  if (!fallback.ok) return 0;
  const arr = (await fallback.json()) as unknown[];
  return Array.isArray(arr) ? arr.length : 0;
}

/**
 * Maps an assigned KC role name for a native area to the native role id
 * expected by the provider.
 *
 * - Seeded role (w `area.kcRoles`) → `nativeRoleId` z seeda.
 * - Custom role (`<areaId>_custom_<slug>`) → id natywny trzyma registry
 *   roli KC w `attributes.nativeRoleId` (single-value) — odczytywany
 *   osobno; jeśli brak → używamy samego KC name jako fallback (provider
 *   powinien umieć mu się poradzić, bo sam tworzył tę rolę).
 */
export function mapKcToNativeRoleId(
  area: PermissionArea,
  kcRoleName: string,
  attributes?: Record<string, string[]>,
): string | null {
  const seed = area.kcRoles.find((r) => r.name === kcRoleName);
  if (seed?.nativeRoleId !== undefined) return seed.nativeRoleId;
  const attr = attributes?.nativeRoleId?.[0];
  return attr ?? null;
}

export interface AssignUserAreaRoleArgs {
  userId: string;
  areaId: string;
  /** null = odbieramy wszystkie role w area. */
  roleName: string | null;
}

export interface AssignUserAreaRoleResult {
  areaId: string;
  removed: string[];
  added: string[];
  nativeSync: "ok" | "skipped" | "failed";
  nativeError?: string;
}

/**
 * Ustala pożądany stan ról usera w jednym area i synchronizuje go z
 * Keycloak + natywnym providerem (jeśli area = native).
 */
export async function assignUserAreaRole(
  args: AssignUserAreaRoleArgs,
): Promise<AssignUserAreaRoleResult> {
  const area = getArea(args.areaId);
  if (!area) throw new Error(`Unknown area: ${args.areaId}`);

  const adminToken = await keycloak.getServiceAccountToken();
  const kcUser = await getKcUser(adminToken, args.userId);
  const currentRoles = await listUserRealmRoles(adminToken, args.userId);

  const areaRoleNames = new Set(listAreaKcRoleNames(area));
  // Również wszystkie custom role area (prefix-match) — żeby sprzątać
  // nieseedowane role należące do area.
  const areaPrefix = `${area.id.replace(/-/g, "_")}_`;
  const userAreaRoles = currentRoles.filter(
    (r) => areaRoleNames.has(r.name) || r.name.startsWith(areaPrefix),
  );

  const toKeep = args.roleName;
  const toRemove = userAreaRoles.filter((r) => r.name !== toKeep);
  const alreadyHas = toKeep ? userAreaRoles.some((r) => r.name === toKeep) : false;

  await removeRolesFromUser(adminToken, args.userId, toRemove);

  let addedRole: RoleRepresentation | null = null;
  if (toKeep && !alreadyHas) {
    addedRole = await ensureRealmRoleExists(adminToken, toKeep);
    await addRolesToUser(adminToken, args.userId, [addedRole]);
  }

  // Native sync
  let nativeSync: AssignUserAreaRoleResult["nativeSync"] = "skipped";
  let nativeError: string | undefined;
  if (area.provider === "native") {
    const provider = getProvider(area.nativeProviderId);
    if (provider && provider.isConfigured() && kcUser.email) {
      try {
        // Custom role-y (stworzone przez /api/admin/areas/[id]/roles) trzymają
        // `nativeRoleId` w KC attributes. Gdy `toKeep` nie jest seedem,
        // musimy sięgnąć po pełną reprezentację roli żeby dostać id.
        let kcRoleAttributes: Record<string, string[]> | undefined;
        if (toKeep && !area.kcRoles.some((r) => r.name === toKeep)) {
          const roleRes = await keycloak.adminRequest(
            `/roles/${encodeURIComponent(toKeep)}?briefRepresentation=false`,
            adminToken,
          );
          if (roleRes.ok) {
            const full = (await roleRes.json()) as RoleRepresentation;
            kcRoleAttributes = full.attributes;
          }
        }
        const nativeRoleId = toKeep
          ? mapKcToNativeRoleId(area, toKeep, kcRoleAttributes)
          : null;
        const displayName =
          [kcUser.firstName, kcUser.lastName].filter(Boolean).join(" ").trim() ||
          kcUser.username ||
          kcUser.email;
        await provider.assignUserRole({
          email: kcUser.email,
          displayName,
          roleId: nativeRoleId,
        });
        // Zawsze odśwież profil z KC jako SoT. Best-effort — błąd nie
        // przekreśla sukcesu role-assign.
        await provider
          .syncUserProfile({
            email: kcUser.email,
            firstName: kcUser.firstName ?? null,
            lastName: kcUser.lastName ?? null,
            displayName,
            phone: getPhone(kcUser),
          })
          .catch((err) => {
            console.warn(
              `[sync] syncUserProfile ${area.nativeProviderId} failed for ${kcUser.email}:`,
              err instanceof Error ? err.message : err,
            );
          });
        nativeSync = "ok";
      } catch (err) {
        nativeSync = "failed";
        nativeError = err instanceof Error ? err.message : String(err);
      }
    }
  } else if (area.id === "documenso" && kcUser.email) {
    // Documenso jest keycloak-only area. Sync `roles[]`: admin → [USER,ADMIN],
    // handler/user → [USER]. Po usunięciu DOCUMENSO_EMPLOYEE (2026-04-23)
    // nie blokujemy loginu — każda persona korzysta z Documenso UI.
    try {
      const documensoRole: "USER" | "ADMIN" =
        toKeep === "documenso_admin" ? "ADMIN" : "USER";
      const displayName =
        [kcUser.firstName, kcUser.lastName].filter(Boolean).join(" ").trim() ||
        kcUser.username ||
        null;
      await syncDocumensoUserRole(kcUser.email, documensoRole, displayName);
      nativeSync = "ok";
    } catch (err) {
      nativeSync = "failed";
      nativeError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    areaId: area.id,
    removed: toRemove.map((r) => r.name),
    added: addedRole ? [addedRole.name] : [],
    nativeSync,
    nativeError,
  };
}

export interface AreaAssignmentSummary {
  areaId: string;
  roleName: string | null;
}

/**
 * Liczy aktualne przypisania usera per-area. Zwraca rolę z najwyższym
 * priorytetem gdy (w wyniku desynchronizacji) ma więcej niż jedną.
 */
export async function getUserAreaAssignments(userId: string): Promise<AreaAssignmentSummary[]> {
  const adminToken = await keycloak.getServiceAccountToken();
  const roles = await listUserRealmRoles(adminToken, userId);
  const byArea = new Map<string, string[]>();
  for (const role of roles) {
    const area = findAreaForRole(role.name);
    if (!area) continue;
    const list = byArea.get(area.id) ?? [];
    list.push(role.name);
    byArea.set(area.id, list);
  }

  const out: AreaAssignmentSummary[] = [];
  for (const area of AREAS) {
    const assigned = byArea.get(area.id) ?? [];
    if (assigned.length === 0) {
      out.push({ areaId: area.id, roleName: null });
      continue;
    }
    // Dla seeded preferujemy najwyższy priorytet; custom (spoza seed) ma
    // priorytet 50 domyślnie (między user a admin) — wybieramy pierwszą
    // taką, jeśli żadna seed nie pasuje.
    const seedMatches = area.kcRoles.filter((s) =>
      assigned.includes(s.name),
    );
    if (seedMatches.length > 0) {
      const best = seedMatches.reduce((a, b) =>
        a.priority >= b.priority ? a : b,
      );
      out.push({ areaId: area.id, roleName: best.name });
    } else {
      out.push({ areaId: area.id, roleName: assigned[0] });
    }
  }
  return out;
}


/**
 * Dla podanego usera KC: iteruje wszystkie area z natywnym providerem
 * oraz area `documenso` (keycloak-only + DB sync) i wywołuje
 * `syncUserProfile` — upewnia się, że imię/nazwisko/email/telefon
 * są zsynchronizowane w każdej aplikacji natywnej. Używane po zmianie
 * profilu w KC (event listener / cron reconciliation / manual refresh).
 */
export interface ProfilePropagationResult {
  areaId: string;
  status: "ok" | "skipped" | "failed";
  error?: string;
}
export async function propagateProfileFromKc(
  userId: string,
  opts: { previousEmail?: string } = {},
): Promise<ProfilePropagationResult[]> {
  const adminToken = await keycloak.getServiceAccountToken();
  const kcUser = await getKcUser(adminToken, userId);
  if (!kcUser.email) return [{ areaId: "*", status: "skipped" }];

  const displayName =
    [kcUser.firstName, kcUser.lastName].filter(Boolean).join(" ").trim() ||
    kcUser.username ||
    kcUser.email;
  const phone = getPhone(kcUser);

  const results: ProfilePropagationResult[] = [];

  for (const area of AREAS) {
    if (area.provider !== "native") continue;
    const provider = getProvider(area.nativeProviderId);
    if (!provider || !provider.isConfigured()) {
      results.push({ areaId: area.id, status: "skipped" });
      continue;
    }
    try {
      await provider.syncUserProfile({
        email: kcUser.email,
        previousEmail: opts.previousEmail,
        firstName: kcUser.firstName ?? null,
        lastName: kcUser.lastName ?? null,
        displayName,
        phone,
      });
      results.push({ areaId: area.id, status: "ok" });
    } catch (err) {
      results.push({
        areaId: area.id,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Documenso (keycloak-only area) ma własny DB sync — imię + email
  // (guest-signing jest po emailu, więc musimy ciągnąć rename).
  try {
    const { syncDocumensoUserRole } = await import("@/lib/documenso");
    await syncDocumensoUserRole(kcUser.email, "USER", displayName);
    results.push({ areaId: "documenso", status: "ok" });
  } catch (err) {
    results.push({
      areaId: "documenso",
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return results;
}

export { listAllRealmRoles, listUserRealmRoles, getKcUser };
