export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  LEGACY_ROLE_REMAP,
  findAreaForRole,
  getArea,
} from "@/lib/permissions/areas";
import { assignUserAreaRole } from "@/lib/permissions/sync";
import { appendIamAudit } from "@/lib/permissions/db";
import { log } from "@/lib/logger";

/**
 * POST /api/admin/iam/migrate-legacy-roles
 *
 * Batch migracja istniejących userów z legacy ról (chatwoot_user,
 * documenso_user, moodle_user, knowledge_user itd.) na nowy taksonomię
 * 2026-04. Dla każdego userа z legacy rolą:
 *   1. Znajdź target rolę z `LEGACY_ROLE_REMAP`.
 *   2. Jeśli target = `__removed__` → po prostu odbieramy legacy rolę
 *      (area przeszła na admin-only: directus_user, postal_user).
 *   3. W przeciwnym wypadku wywołujemy `assignUserAreaRole` z target
 *      rolą — to dokonuje jednoznacznego remapu + propagacji do native
 *      providera (Chatwoot role switch, Documenso team role itd.).
 *   4. Usuwa legacy rolę z realmu po zmigrowaniu wszystkich (opcjonalnie,
 *      kontrolowane flagą `deleteLegacy` w body).
 *
 * Bezpieczeństwo:
 *   - Tylko keycloak_admin / realm-admin. `requireAdminPanel` guard.
 *   - Każda operacja audyt-owana (user.assign z actor `admin:<email>`).
 *   - Idempotentne: ponowne wywołanie nie robi nic gdy user już ma nową
 *     rolę (assignUserAreaRole wykrywa "already has" i tylko ewentualnie
 *     czyści duplikaty).
 */

interface Payload {
  /** Po zmigrowaniu wszystkich userów usuń legacy role z realmu. */
  deleteLegacy?: boolean;
  /** Migruj tylko podany użytkownik (userId). Domyślnie: wszyscy. */
  userId?: string;
  /** Limit userów do zmigrowania w jednym wywołaniu (default 500). */
  limit?: number;
}

interface UserResult {
  userId: string;
  username: string;
  email: string | null;
  migrated: Array<{
    from: string;
    to: string | null;
    areaId: string | null;
    status: "ok" | "skipped" | "failed";
    error?: string;
  }>;
}

interface KcUser {
  id: string;
  username?: string;
  email?: string;
}

interface KcRole {
  id: string;
  name: string;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const body = (await req.json().catch(() => ({}))) as Payload;
    const deleteLegacy = body.deleteLegacy === true;
    const limit = Math.min(Math.max(body.limit ?? 500, 1), 2000);
    const onlyUserId = body.userId?.trim() || null;

    const adminToken = await keycloak.getServiceAccountToken();
    const actor = `admin:${session.user?.email ?? session.user?.id ?? "?"}`;

    // 1. Zbierz legacy role istniejące w realmie — bez sensu wołać Admin API
    // dla ról których nie ma.
    const existingLegacyRoles = await listExistingLegacyRoles(adminToken);
    if (existingLegacyRoles.size === 0) {
      return createSuccessResponse({
        message: "Brak legacy ról w realmie — nic do migracji.",
        totalUsers: 0,
        migratedUsers: 0,
        errors: [],
        results: [],
        deletedLegacyRoles: [],
      });
    }

    // 2. Zbuduj zbiór userów do zmigrowania.
    const users = onlyUserId
      ? await fetchUser(adminToken, onlyUserId).then((u) => (u ? [u] : []))
      : await listAllUsers(adminToken, limit);

    const results: UserResult[] = [];
    let migratedUsers = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const u of users) {
      const res: UserResult = {
        userId: u.id,
        username: u.username ?? "",
        email: u.email ?? null,
        migrated: [],
      };
      try {
        const userRoles = await listUserRealmRoleNames(adminToken, u.id);
        const legacyOwned = userRoles.filter((r) => existingLegacyRoles.has(r));
        if (legacyOwned.length === 0) {
          results.push(res);
          continue;
        }

        for (const legacy of legacyOwned) {
          const target = LEGACY_ROLE_REMAP[legacy] ?? null;
          const area = findAreaForRole(legacy) ?? findAreaForRole(target ?? "");
          if (target === "__removed__") {
            // Area przeszła na admin-only — po prostu odbierz legacy.
            try {
              if (area) {
                await assignUserAreaRole({
                  userId: u.id,
                  areaId: area.id,
                  roleName: null,
                });
              }
              res.migrated.push({
                from: legacy,
                to: null,
                areaId: area?.id ?? null,
                status: "ok",
              });
            } catch (err) {
              res.migrated.push({
                from: legacy,
                to: null,
                areaId: area?.id ?? null,
                status: "failed",
                error: err instanceof Error ? err.message : String(err),
              });
            }
            continue;
          }

          if (!target || !area || !getArea(area.id)) {
            res.migrated.push({
              from: legacy,
              to: target,
              areaId: area?.id ?? null,
              status: "skipped",
              error: "No target remap / area not found",
            });
            continue;
          }

          try {
            await assignUserAreaRole({
              userId: u.id,
              areaId: area.id,
              roleName: target,
            });
            res.migrated.push({
              from: legacy,
              to: target,
              areaId: area.id,
              status: "ok",
            });
          } catch (err) {
            res.migrated.push({
              from: legacy,
              to: target,
              areaId: area.id,
              status: "failed",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (res.migrated.some((m) => m.status === "ok")) {
          migratedUsers++;
          await appendIamAudit({
            actor,
            operation: "user.assign",
            targetType: "user",
            targetId: u.id,
            status: res.migrated.some((m) => m.status === "failed")
              ? "error"
              : "ok",
            details: {
              reason: "legacy-role-migration",
              moves: res.migrated,
              email: u.email,
            },
          });
        }
      } catch (err) {
        errors.push({
          userId: u.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      results.push(res);
    }

    // 3. Opcjonalne usunięcie legacy ról z realmu (po zmigrowaniu wszystkich).
    const deletedLegacyRoles: string[] = [];
    if (deleteLegacy && !onlyUserId) {
      for (const legacyName of existingLegacyRoles) {
        try {
          const stillAssigned = await countUsersWithRole(adminToken, legacyName);
          if (stillAssigned > 0) {
            log.warn("legacy role still assigned — skipping deletion", {
              role: legacyName,
              users: stillAssigned,
            });
            continue;
          }
          await deleteRealmRole(adminToken, legacyName);
          deletedLegacyRoles.push(legacyName);
        } catch (err) {
          log.warn("delete legacy role failed", {
            role: legacyName,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    await appendIamAudit({
      actor,
      operation: "kc.sync",
      targetType: "realm",
      status: errors.length === 0 ? "ok" : "error",
      details: {
        kind: "migrate-legacy-roles",
        totalUsers: users.length,
        migratedUsers,
        deletedLegacyRoles,
        errorCount: errors.length,
      },
    });

    return createSuccessResponse({
      totalUsers: users.length,
      migratedUsers,
      errors,
      results,
      deletedLegacyRoles,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// ── KC Admin API helpers ─────────────────────────────────────────────────

async function listExistingLegacyRoles(token: string): Promise<Set<string>> {
  const legacyNames = Object.keys(LEGACY_ROLE_REMAP);
  const existing = new Set<string>();
  for (const name of legacyNames) {
    const res = await keycloak.adminRequest(
      `/roles/${encodeURIComponent(name)}`,
      token,
    );
    if (res.ok) existing.add(name);
  }
  return existing;
}

async function fetchUser(
  token: string,
  userId: string,
): Promise<KcUser | null> {
  const res = await keycloak.adminRequest(
    `/users/${encodeURIComponent(userId)}`,
    token,
  );
  if (!res.ok) return null;
  return (await res.json()) as KcUser;
}

async function listAllUsers(
  token: string,
  limit: number,
): Promise<KcUser[]> {
  const out: KcUser[] = [];
  const pageSize = Math.min(100, limit);
  let first = 0;
  while (out.length < limit) {
    const res = await keycloak.adminRequest(
      `/users?first=${first}&max=${pageSize}&briefRepresentation=true`,
      token,
    );
    if (!res.ok) throw new Error(`listAllUsers: ${res.status}`);
    const batch = (await res.json()) as KcUser[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < pageSize) break;
    first += pageSize;
  }
  return out.slice(0, limit);
}

async function listUserRealmRoleNames(
  token: string,
  userId: string,
): Promise<string[]> {
  const res = await keycloak.adminRequest(
    `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
    token,
  );
  if (!res.ok) return [];
  const roles = (await res.json()) as KcRole[];
  return roles.map((r) => r.name);
}

async function countUsersWithRole(
  token: string,
  roleName: string,
): Promise<number> {
  const res = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(roleName)}/users/count`,
    token,
  );
  if (res.ok) {
    const data = (await res.json()) as number | { count?: number };
    if (typeof data === "number") return data;
    if (data && typeof data === "object" && "count" in data)
      return Number(data.count ?? 0);
  }
  // Fallback: list userów.
  const fallback = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(roleName)}/users?first=0&max=200`,
    token,
  );
  if (!fallback.ok) return 0;
  const arr = (await fallback.json()) as unknown[];
  return Array.isArray(arr) ? arr.length : 0;
}

async function deleteRealmRole(token: string, name: string): Promise<void> {
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
