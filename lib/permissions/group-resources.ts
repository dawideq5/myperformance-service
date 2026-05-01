/**
 * mp_group_resources — mapping Keycloak groups → konkretne zasoby aplikacji
 * (Documenso org/team, Moodle course, Chatwoot inbox).
 *
 * Use case (z brief'u):
 *   Grupa "Sprzedawcy katowicach" → automatycznie nadaje membership w
 *   Documenso org "Pracownik" / team "Moje dokumenty" + Moodle course
 *   "Onboarding sprzedawców" + Chatwoot inbox "Sprzedaż".
 *
 * Wybór: NIE przechowujemy tego w Keycloak group attributes (limit 256B
 * per attr i brak typowania), tylko w lokalnej Postgres `mp_group_resources`.
 *
 * Rule (idempotent):
 *   - INSERT triggerem przy join → wywołaj odpowiednie POST /api/admin/users/[id]/{moodle|chatwoot|documenso}
 *   - DELETE triggerem przy leave → wywołaj remove
 *
 * Failure-mode: best-effort. Jeśli któryś provider zwróci błąd, logujemy +
 * audit trail; nie blokujemy join/leave grupy. Admin może manualnie
 * doprovisionować.
 */
import type { PoolClient } from "pg";
import { withIamClient } from "./db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "group-resources" });

let schemaReady: Promise<void> | null = null;

async function ensureSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS mp_group_resources (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id        TEXT NOT NULL,
      kind            TEXT NOT NULL CHECK (kind IN (
        'documenso_org',
        'moodle_course',
        'chatwoot_inbox'
      )),
      -- resource_id ma typ string aby pomieścić zarówno UUID (Documenso)
      -- jak i numeric ID (Moodle/Chatwoot). Convert at boundary.
      resource_id     TEXT NOT NULL,
      -- Opcjonalna rola dla zasobu (np. Documenso ADMIN/MANAGER/MEMBER).
      -- NULL = domyślna rola providera.
      role_hint       TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by      TEXT,
      UNIQUE (group_id, kind, resource_id)
    );
    CREATE INDEX IF NOT EXISTS mp_group_resources_group_idx
      ON mp_group_resources (group_id);
    CREATE INDEX IF NOT EXISTS mp_group_resources_kind_idx
      ON mp_group_resources (kind);
  `);
}

async function ensureSchemaOnce(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await withIamClient(async (c) => {
        await ensureSchema(c);
      });
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export type GroupResourceKind =
  | "documenso_org"
  | "moodle_course"
  | "chatwoot_inbox";

export interface GroupResourceMapping {
  id: string;
  groupId: string;
  kind: GroupResourceKind;
  resourceId: string;
  roleHint: string | null;
  createdAt: string;
  createdBy: string | null;
}

export async function listGroupResources(
  groupId: string,
): Promise<GroupResourceMapping[]> {
  await ensureSchemaOnce();
  return withIamClient(async (c) => {
    const r = await c.query(
      `SELECT id, group_id, kind, resource_id, role_hint, created_at, created_by
         FROM mp_group_resources
        WHERE group_id = $1
        ORDER BY kind, resource_id`,
      [groupId],
    );
    return r.rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      kind: row.kind,
      resourceId: row.resource_id,
      roleHint: row.role_hint,
      createdAt: row.created_at.toISOString(),
      createdBy: row.created_by,
    }));
  });
}

export async function addGroupResource(args: {
  groupId: string;
  kind: GroupResourceKind;
  resourceId: string;
  roleHint?: string | null;
  actor?: string;
}): Promise<GroupResourceMapping> {
  await ensureSchemaOnce();
  return withIamClient(async (c) => {
    const r = await c.query(
      `INSERT INTO mp_group_resources (group_id, kind, resource_id, role_hint, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (group_id, kind, resource_id) DO UPDATE
         SET role_hint = EXCLUDED.role_hint
       RETURNING id, group_id, kind, resource_id, role_hint, created_at, created_by`,
      [args.groupId, args.kind, args.resourceId, args.roleHint ?? null, args.actor ?? null],
    );
    const row = r.rows[0];
    return {
      id: row.id,
      groupId: row.group_id,
      kind: row.kind,
      resourceId: row.resource_id,
      roleHint: row.role_hint,
      createdAt: row.created_at.toISOString(),
      createdBy: row.created_by,
    };
  });
}

export async function removeGroupResource(id: string): Promise<void> {
  await ensureSchemaOnce();
  await withIamClient(async (c) => {
    await c.query(`DELETE FROM mp_group_resources WHERE id = $1`, [id]);
  });
}

/**
 * Helper: tworzy fetch absolute URL (potrzebny do internal-call z runtime).
 * Używamy NEXTAUTH_URL bo zawsze jest skonfigurowane (KC OIDC uses it).
 */
function internalBaseUrl(): string {
  const url = process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000";
  return url.replace(/\/$/, "");
}

/**
 * Apply / revoke wszystkie mappingi danej grupy dla podanego usera.
 *
 * Wywołujemy native API (POST /api/admin/users/[id]/{moodle|chatwoot|documenso})
 * przez fetch — to jedyne miejsce gdzie istnieje pełna logika create-on-add
 * + provider sync. Nie duplikujemy jej.
 *
 * Best-effort: zwracamy listę wyników; nie rzucamy gdy któryś provider odpadł.
 */
export interface ApplyResult {
  kind: GroupResourceKind;
  resourceId: string;
  status: "ok" | "failed";
  error?: string;
}

export async function applyGroupResourcesForUser(args: {
  groupId: string;
  userId: string;
  action: "add" | "remove";
  /** Cookie z requestu admin'a — używamy jego do auth internal API call. */
  cookieHeader?: string;
}): Promise<ApplyResult[]> {
  const mappings = await listGroupResources(args.groupId);
  const results: ApplyResult[] = [];
  const base = internalBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (args.cookieHeader) headers.Cookie = args.cookieHeader;

  for (const m of mappings) {
    try {
      let path: string | null = null;
      let body: Record<string, unknown> = { action: args.action };

      switch (m.kind) {
        case "documenso_org":
          path = `/api/admin/users/${encodeURIComponent(args.userId)}/documenso`;
          body = {
            action: args.action,
            organisationId: m.resourceId,
            ...(m.roleHint ? { organisationRole: m.roleHint } : {}),
          };
          break;
        case "moodle_course":
          path = `/api/admin/users/${encodeURIComponent(args.userId)}/moodle`;
          body = { action: args.action, courseId: Number(m.resourceId) };
          break;
        case "chatwoot_inbox":
          path = `/api/admin/users/${encodeURIComponent(args.userId)}/chatwoot`;
          body = { action: args.action, inboxId: Number(m.resourceId) };
          break;
      }

      if (!path) {
        results.push({
          kind: m.kind,
          resourceId: m.resourceId,
          status: "failed",
          error: "unknown kind",
        });
        continue;
      }

      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        results.push({
          kind: m.kind,
          resourceId: m.resourceId,
          status: "failed",
          error: `HTTP ${res.status} ${text.slice(0, 120)}`,
        });
      } else {
        results.push({
          kind: m.kind,
          resourceId: m.resourceId,
          status: "ok",
        });
      }
    } catch (err) {
      results.push({
        kind: m.kind,
        resourceId: m.resourceId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (results.some((r) => r.status === "failed")) {
    logger.warn("applyGroupResourcesForUser had failures", {
      groupId: args.groupId,
      userId: args.userId,
      action: args.action,
      failedCount: results.filter((r) => r.status === "failed").length,
    });
  }
  return results;
}
