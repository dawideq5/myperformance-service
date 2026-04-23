import { Pool, type PoolClient } from "pg";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

/**
 * Central IAM schema — metaroles, per-app mappings, user assignments, audit.
 *
 * Ten moduł implementuje "Federated Role Mapping" z raportu IAM (§ Table 2).
 * Kluczowe tabele:
 *
 *   - central_metaroles    — wirtualne jednostki uprawnień ("kierownik HR",
 *                            "junior developer"), niezależne od aplikacji
 *                            docelowej. Admin tworzy je w panelu.
 *   - app_role_mapping     — per-metarole mapping na każdą podpiętą aplikację
 *                            (1 metarole → N natywnych ról, po jednej per
 *                            aplikacja). Pozwala na downcasting (np. Documenso
 *                            MEMBER/MANAGER/ADMIN) wg priority.
 *   - user_role_junction   — przypisania user → metarole. Source of truth dla
 *                            agregacji ról przesyłanych do aplikacji.
 *   - iam_audit_log        — append-only log operacji IAM (create/update/delete
 *                            metarole, assign/unassign user, sync success/fail).
 *
 * KC role pozostają "shadow projection" — dashboardowy sync propaguje
 * metarole → realm_role, a z realm_role → natywne role przez providers. Ten
 * schemat zastępuje twarde area.kcRoles[] definicje z `areas.ts` dynamicznymi
 * wierszami w DB, zostawiając `areas.ts` jako seed dla migracji.
 */

const logger = log.child({ module: "iam-db" });

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabaseUrl(): string | null {
  const url = getOptionalEnv("DATABASE_URL").trim();
  return url.length > 0 ? url : null;
}

function getPool(): Pool {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL not configured (IAM DB requires Postgres)");
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (err) => {
      logger.error("pg pool error", { err: err.message });
    });
  }
  return pool;
}

async function ensureSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS central_metaroles (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug         TEXT NOT NULL UNIQUE,
      label        TEXT NOT NULL,
      description  TEXT NULL,
      area_id      TEXT NOT NULL,
      priority     INT NOT NULL DEFAULT 10,
      system_seed  BOOLEAN NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS central_metaroles_area_idx
      ON central_metaroles (area_id);

    CREATE TABLE IF NOT EXISTS app_role_mapping (
      id               BIGSERIAL PRIMARY KEY,
      metarole_id      UUID NOT NULL REFERENCES central_metaroles(id) ON DELETE CASCADE,
      app_id           TEXT NOT NULL,
      native_role_id   TEXT NULL,
      native_role_name TEXT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (metarole_id, app_id)
    );
    CREATE INDEX IF NOT EXISTS app_role_mapping_app_idx
      ON app_role_mapping (app_id);

    CREATE TABLE IF NOT EXISTS user_role_junction (
      id           BIGSERIAL PRIMARY KEY,
      user_id      TEXT NOT NULL,
      user_email   TEXT NOT NULL,
      metarole_id  UUID NOT NULL REFERENCES central_metaroles(id) ON DELETE CASCADE,
      assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      assigned_by  TEXT NULL,
      UNIQUE (user_id, metarole_id)
    );
    CREATE INDEX IF NOT EXISTS user_role_junction_email_idx
      ON user_role_junction (user_email);
    CREATE INDEX IF NOT EXISTS user_role_junction_metarole_idx
      ON user_role_junction (metarole_id);

    CREATE TABLE IF NOT EXISTS iam_audit_log (
      id           BIGSERIAL PRIMARY KEY,
      ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor        TEXT NOT NULL,
      operation    TEXT NOT NULL,
      target_type  TEXT NOT NULL,
      target_id    TEXT NULL,
      app_id       TEXT NULL,
      status       TEXT NOT NULL CHECK (status IN ('ok', 'error', 'retry')),
      details      JSONB NULL,
      error        TEXT NULL
    );
    CREATE INDEX IF NOT EXISTS iam_audit_log_ts_idx
      ON iam_audit_log (ts DESC);
    CREATE INDEX IF NOT EXISTS iam_audit_log_target_idx
      ON iam_audit_log (target_type, target_id);
  `);
}

export async function withIamClient<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const p = getPool();
  if (!schemaReady) {
    schemaReady = (async () => {
      const c = await p.connect();
      try {
        await ensureSchema(c);
      } finally {
        c.release();
      }
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
  const c = await p.connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

export function isIamDbConfigured(): boolean {
  return getDatabaseUrl() !== null;
}

// ---------- Metarole CRUD ----------

export interface Metarole {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  areaId: string;
  priority: number;
  systemSeed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppRoleMapping {
  metaroleId: string;
  appId: string;
  nativeRoleId: string | null;
  nativeRoleName: string | null;
}

export interface MetaroleWithMappings extends Metarole {
  mappings: AppRoleMapping[];
}

function rowToMetarole(r: {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  area_id: string;
  priority: number;
  system_seed: boolean;
  created_at: Date;
  updated_at: Date;
}): Metarole {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    description: r.description,
    areaId: r.area_id,
    priority: r.priority,
    systemSeed: r.system_seed,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listMetaroles(): Promise<MetaroleWithMappings[]> {
  return withIamClient(async (c) => {
    const metaRes = await c.query(
      `SELECT id, slug, label, description, area_id, priority, system_seed,
              created_at, updated_at
         FROM central_metaroles
         ORDER BY area_id, priority DESC, label`,
    );
    if (metaRes.rows.length === 0) return [];
    const ids = metaRes.rows.map((r) => r.id as string);
    const mapRes = await c.query(
      `SELECT metarole_id, app_id, native_role_id, native_role_name
         FROM app_role_mapping
        WHERE metarole_id = ANY($1::uuid[])`,
      [ids],
    );
    const mapsByMeta = new Map<string, AppRoleMapping[]>();
    for (const row of mapRes.rows) {
      const mid = row.metarole_id as string;
      const list = mapsByMeta.get(mid) ?? [];
      list.push({
        metaroleId: mid,
        appId: row.app_id as string,
        nativeRoleId: (row.native_role_id as string | null) ?? null,
        nativeRoleName: (row.native_role_name as string | null) ?? null,
      });
      mapsByMeta.set(mid, list);
    }
    return metaRes.rows.map((r) => ({
      ...rowToMetarole(r),
      mappings: mapsByMeta.get(r.id as string) ?? [],
    }));
  });
}

export async function getMetaroleById(
  id: string,
): Promise<MetaroleWithMappings | null> {
  return withIamClient(async (c) => {
    const r = await c.query(
      `SELECT id, slug, label, description, area_id, priority, system_seed,
              created_at, updated_at
         FROM central_metaroles WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (r.rows.length === 0) return null;
    const m = await c.query(
      `SELECT metarole_id, app_id, native_role_id, native_role_name
         FROM app_role_mapping WHERE metarole_id = $1`,
      [id],
    );
    return {
      ...rowToMetarole(r.rows[0]),
      mappings: m.rows.map((row) => ({
        metaroleId: row.metarole_id as string,
        appId: row.app_id as string,
        nativeRoleId: (row.native_role_id as string | null) ?? null,
        nativeRoleName: (row.native_role_name as string | null) ?? null,
      })),
    };
  });
}

export async function upsertMetarole(args: {
  slug: string;
  label: string;
  description?: string | null;
  areaId: string;
  priority: number;
  systemSeed?: boolean;
  mappings?: Array<{
    appId: string;
    nativeRoleId?: string | null;
    nativeRoleName?: string | null;
  }>;
}): Promise<Metarole> {
  return withIamClient(async (c) => {
    await c.query("BEGIN");
    try {
      const up = await c.query(
        `INSERT INTO central_metaroles
           (slug, label, description, area_id, priority, system_seed, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (slug) DO UPDATE SET
           label = EXCLUDED.label,
           description = EXCLUDED.description,
           area_id = EXCLUDED.area_id,
           priority = EXCLUDED.priority,
           system_seed = central_metaroles.system_seed OR EXCLUDED.system_seed,
           updated_at = now()
         RETURNING id, slug, label, description, area_id, priority, system_seed,
                   created_at, updated_at`,
        [
          args.slug,
          args.label,
          args.description ?? null,
          args.areaId,
          args.priority,
          args.systemSeed ?? false,
        ],
      );
      const metarole = rowToMetarole(up.rows[0]);

      if (args.mappings && args.mappings.length > 0) {
        for (const m of args.mappings) {
          await c.query(
            `INSERT INTO app_role_mapping
               (metarole_id, app_id, native_role_id, native_role_name)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (metarole_id, app_id) DO UPDATE SET
               native_role_id = EXCLUDED.native_role_id,
               native_role_name = EXCLUDED.native_role_name`,
            [
              metarole.id,
              m.appId,
              m.nativeRoleId ?? null,
              m.nativeRoleName ?? null,
            ],
          );
        }
      }
      await c.query("COMMIT");
      return metarole;
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
  });
}

export async function deleteMetarole(id: string): Promise<void> {
  await withIamClient(async (c) => {
    await c.query(
      `DELETE FROM central_metaroles WHERE id = $1 AND system_seed = FALSE`,
      [id],
    );
  });
}

// ---------- User ↔ Metarole assignments ----------

export interface UserRoleAssignment {
  id: string;
  userId: string;
  userEmail: string;
  metaroleId: string;
  assignedAt: string;
  assignedBy: string | null;
}

export async function assignUserToMetarole(args: {
  userId: string;
  userEmail: string;
  metaroleId: string;
  assignedBy?: string | null;
}): Promise<void> {
  await withIamClient(async (c) => {
    await c.query(
      `INSERT INTO user_role_junction
         (user_id, user_email, metarole_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, metarole_id) DO UPDATE SET
         user_email = EXCLUDED.user_email,
         assigned_by = EXCLUDED.assigned_by`,
      [
        args.userId,
        args.userEmail.toLowerCase(),
        args.metaroleId,
        args.assignedBy ?? null,
      ],
    );
  });
}

export async function unassignUserFromMetarole(args: {
  userId: string;
  metaroleId: string;
}): Promise<void> {
  await withIamClient(async (c) => {
    await c.query(
      `DELETE FROM user_role_junction WHERE user_id = $1 AND metarole_id = $2`,
      [args.userId, args.metaroleId],
    );
  });
}

export async function getUserMetaroles(
  userId: string,
): Promise<MetaroleWithMappings[]> {
  return withIamClient(async (c) => {
    const r = await c.query(
      `SELECT m.id, m.slug, m.label, m.description, m.area_id, m.priority,
              m.system_seed, m.created_at, m.updated_at
         FROM user_role_junction j
         JOIN central_metaroles m ON m.id = j.metarole_id
        WHERE j.user_id = $1
        ORDER BY m.area_id, m.priority DESC`,
      [userId],
    );
    if (r.rows.length === 0) return [];
    const ids = r.rows.map((row) => row.id as string);
    const mapRes = await c.query(
      `SELECT metarole_id, app_id, native_role_id, native_role_name
         FROM app_role_mapping
        WHERE metarole_id = ANY($1::uuid[])`,
      [ids],
    );
    const mapsByMeta = new Map<string, AppRoleMapping[]>();
    for (const row of mapRes.rows) {
      const mid = row.metarole_id as string;
      const list = mapsByMeta.get(mid) ?? [];
      list.push({
        metaroleId: mid,
        appId: row.app_id as string,
        nativeRoleId: (row.native_role_id as string | null) ?? null,
        nativeRoleName: (row.native_role_name as string | null) ?? null,
      });
      mapsByMeta.set(mid, list);
    }
    return r.rows.map((row) => ({
      ...rowToMetarole(row),
      mappings: mapsByMeta.get(row.id as string) ?? [],
    }));
  });
}

// ---------- Audit log ----------

export type IamAuditStatus = "ok" | "error" | "retry";
export type IamAuditOperation =
  | "metarole.create"
  | "metarole.update"
  | "metarole.delete"
  | "mapping.upsert"
  | "user.assign"
  | "user.unassign"
  | "sync.push"
  | "sync.pull"
  | "seed.apply"
  | "kc.sync";

export interface IamAuditEntry {
  actor: string;
  operation: IamAuditOperation;
  targetType: "metarole" | "user" | "mapping" | "area" | "app" | "realm";
  targetId?: string | null;
  appId?: string | null;
  status: IamAuditStatus;
  details?: Record<string, unknown> | null;
  error?: string | null;
}

export async function appendIamAudit(entry: IamAuditEntry): Promise<void> {
  if (!isIamDbConfigured()) return;
  try {
    await withIamClient(async (c) => {
      await c.query(
        `INSERT INTO iam_audit_log
           (actor, operation, target_type, target_id, app_id, status, details, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.actor,
          entry.operation,
          entry.targetType,
          entry.targetId ?? null,
          entry.appId ?? null,
          entry.status,
          entry.details ? JSON.stringify(entry.details) : null,
          entry.error ?? null,
        ],
      );
    });
  } catch (err) {
    // Audit log failures nie mogą blokować operacji IAM — to by wyłączyło
    // panel przy padzie DB. Logujemy strukturalnie i idziemy dalej.
    logger.error("appendIamAudit failed", {
      err: err instanceof Error ? err.message : String(err),
      operation: entry.operation,
    });
  }
}

export interface IamAuditRow extends IamAuditEntry {
  id: string;
  ts: string;
}

export async function listIamAudit(args: {
  limit?: number;
  targetType?: IamAuditEntry["targetType"];
  targetId?: string;
}): Promise<IamAuditRow[]> {
  return withIamClient(async (c) => {
    const limit = Math.min(args.limit ?? 100, 500);
    const where: string[] = [];
    const params: unknown[] = [];
    if (args.targetType) {
      params.push(args.targetType);
      where.push(`target_type = $${params.length}`);
    }
    if (args.targetId) {
      params.push(args.targetId);
      where.push(`target_id = $${params.length}`);
    }
    params.push(limit);
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const r = await c.query(
      `SELECT id, ts, actor, operation, target_type, target_id, app_id, status,
              details, error
         FROM iam_audit_log
         ${whereSql}
         ORDER BY ts DESC
         LIMIT $${params.length}`,
      params,
    );
    return r.rows.map((row) => ({
      id: String(row.id),
      ts: (row.ts as Date).toISOString(),
      actor: row.actor as string,
      operation: row.operation as IamAuditOperation,
      targetType: row.target_type as IamAuditEntry["targetType"],
      targetId: (row.target_id as string | null) ?? null,
      appId: (row.app_id as string | null) ?? null,
      status: row.status as IamAuditStatus,
      details: (row.details as Record<string, unknown> | null) ?? null,
      error: (row.error as string | null) ?? null,
    }));
  });
}
