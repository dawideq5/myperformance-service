export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import { propagateProfileFromKc } from "@/lib/permissions/sync";
import { appendIamAudit } from "@/lib/permissions/db";
import { log } from "@/lib/logger";

/**
 * POST /api/admin/iam/resync-profiles
 *
 * Iteruje userów i wywołuje `propagateProfileFromKc` — sync imienia,
 * nazwiska, emaila i telefonu z KC do wszystkich natywnych aplikacji
 * (Chatwoot/Moodle/Documenso/Outline/Directus/Postal). Używane gdy
 * aplikacje mają nieświeże dane (np. historycznie user został utworzony
 * w Chatwoocie z innym imieniem niż w KC).
 *
 * Nie zmienia ról — tylko profile.
 */

interface Payload {
  /** Tylko ten user — inaczej wszyscy userzy realmu. */
  userId?: string;
  /** Limit liczby userów w jednym wywołaniu (default 500, max 2000). */
  limit?: number;
}

interface KcUser {
  id: string;
  username?: string;
  email?: string;
}

interface ResyncPerUser {
  userId: string;
  username: string;
  email: string | null;
  results: Array<{
    areaId: string;
    status: "ok" | "skipped" | "failed";
    error?: string;
  }>;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const body = (await req.json().catch(() => ({}))) as Payload;
    const onlyUserId = body.userId?.trim() || null;
    const limit = Math.min(Math.max(body.limit ?? 500, 1), 2000);

    const adminToken = await keycloak.getServiceAccountToken();
    const actor = `admin:${session.user?.email ?? session.user?.id ?? "?"}`;

    const users = onlyUserId
      ? await fetchUser(adminToken, onlyUserId).then((u) => (u ? [u] : []))
      : await listAllUsers(adminToken, limit);

    const perUser: ResyncPerUser[] = [];
    let okCount = 0;
    let failCount = 0;

    for (const u of users) {
      try {
        const results = await propagateProfileFromKc(u.id);
        const mapped = results.map((r) => ({
          areaId: r.areaId,
          status: r.status,
          error: r.error,
        }));
        perUser.push({
          userId: u.id,
          username: u.username ?? "",
          email: u.email ?? null,
          results: mapped,
        });
        if (mapped.some((r) => r.status === "failed")) failCount++;
        else okCount++;
      } catch (err) {
        failCount++;
        perUser.push({
          userId: u.id,
          username: u.username ?? "",
          email: u.email ?? null,
          results: [
            {
              areaId: "*",
              status: "failed",
              error: err instanceof Error ? err.message : String(err),
            },
          ],
        });
        log.warn("resync-profiles: user failed", {
          userId: u.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await appendIamAudit({
      actor,
      operation: "sync.push",
      targetType: "realm",
      status: failCount === 0 ? "ok" : "error",
      details: {
        kind: "resync-profiles",
        totalUsers: users.length,
        ok: okCount,
        failed: failCount,
        scope: onlyUserId ? "single" : "batch",
      },
    });

    return createSuccessResponse({
      totalUsers: users.length,
      ok: okCount,
      failed: failCount,
      perUser,
    });
  } catch (err) {
    return handleApiError(err);
  }
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
