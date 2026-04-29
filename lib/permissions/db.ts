import { type PoolClient } from "pg";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { getPool } from "@/lib/db";

/**
 * IAM audit log — append-only zapis operacji IAM (assignUserAreaRole,
 * sync KC, webhook events). Schema bootstrap idempotentny przez ensureSchema().
 *
 * **Historia:** ten moduł zawierał także `central_metaroles`, `app_role_mapping`,
 * `user_role_junction` (Federated Role Mapping pattern). Tabele zostały
 * usunięte 2026-04-26 — system od początku korzystał z KC realm roles
 * jako SoT, metaroles były dead infra (0 rows w prod). Patrz git history
 * jeśli potrzeba reanimacji.
 */

const logger = log.child({ module: "iam-db" });

let schemaReady: Promise<void> | null = null;

function getDatabaseUrl(): string | null {
  const url = getOptionalEnv("DATABASE_URL").trim();
  return url.length > 0 ? url : null;
}

async function ensureSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS iam_audit_log (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor           TEXT NOT NULL,
      action          TEXT NOT NULL,
      target_type     TEXT NOT NULL,
      target_id       TEXT NOT NULL,
      payload         JSONB,
      result          TEXT NOT NULL DEFAULT 'success',
      error_message   TEXT
    );
    CREATE INDEX IF NOT EXISTS iam_audit_log_ts_idx
      ON iam_audit_log (ts DESC);
    CREATE INDEX IF NOT EXISTS iam_audit_log_target_idx
      ON iam_audit_log (target_type, target_id);
  `);

  // Migracja: tabela mogła być stworzona w starszej wersji bez kolumny
  // `action` (było `event_type`/inne). Bez tych ALTER TABLE call kc-sync
  // spamuje logi błędem "column action does not exist".
  await client.query(`
    ALTER TABLE iam_audit_log
      ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'unknown';
    ALTER TABLE iam_audit_log
      ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'unknown';
    ALTER TABLE iam_audit_log
      ADD COLUMN IF NOT EXISTS target_id TEXT NOT NULL DEFAULT '';
    ALTER TABLE iam_audit_log
      ADD COLUMN IF NOT EXISTS payload JSONB;
    ALTER TABLE iam_audit_log
      ADD COLUMN IF NOT EXISTS result TEXT NOT NULL DEFAULT 'success';
    ALTER TABLE iam_audit_log
      ADD COLUMN IF NOT EXISTS error_message TEXT;
  `);

  // Drop legacy NOT NULL na starych kolumnach (operation, status) oraz
  // legacy CHECK constraint który blokuje nową wartość result. Bez tego
  // każde appendIamAudit() w istniejącej DB rzuca "null value in column
  // operation violates not-null". DO block — IF EXISTS żeby idempotentnie.
  await client.query(`
    DO $$
    BEGIN
      BEGIN
        ALTER TABLE iam_audit_log ALTER COLUMN operation DROP NOT NULL;
      EXCEPTION WHEN undefined_column OR cannot_alter_relation THEN NULL;
      END;
      BEGIN
        ALTER TABLE iam_audit_log ALTER COLUMN status DROP NOT NULL;
      EXCEPTION WHEN undefined_column OR cannot_alter_relation THEN NULL;
      END;
      BEGIN
        ALTER TABLE iam_audit_log DROP CONSTRAINT IF EXISTS iam_audit_log_status_check;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END $$;
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

// ── Audit log ─────────────────────────────────────────────────────────────

export interface IamAuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown> | null;
  result: "success" | "failure";
  errorMessage: string | null;
}

export async function appendIamAudit(args: {
  actor: string;
  /** Canonical name; alias `operation` accepted dla legacy callsites. */
  action?: string;
  operation?: string;
  targetType: string;
  /** Canonical; legacy callsites z targetType="realm" mogą pomijać. */
  targetId?: string;
  /** Canonical; aliasy `details`, `appId` mergowane w payload. */
  payload?: Record<string, unknown>;
  details?: Record<string, unknown>;
  appId?: string;
  /** Canonical "success"|"failure"; legacy "ok"|"error" mapowane. */
  result?: "success" | "failure";
  status?: "ok" | "error" | "success" | "failure";
  errorMessage?: string;
  error?: string | null;
}): Promise<void> {
  const action = args.action ?? args.operation ?? "unknown";
  const status = args.result ?? args.status ?? "success";
  const result: "success" | "failure" =
    status === "error" || status === "failure" ? "failure" : "success";
  const errorMessage = args.errorMessage ?? args.error ?? null;
  const payload: Record<string, unknown> | null =
    args.payload || args.details || args.appId
      ? {
          ...(args.details ?? {}),
          ...(args.payload ?? {}),
          ...(args.appId ? { appId: args.appId } : {}),
        }
      : null;
  try {
    await withIamClient((c) =>
      c.query(
        `INSERT INTO iam_audit_log
           (actor, action, target_type, target_id, payload, result, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          args.actor,
          action,
          args.targetType,
          args.targetId ?? "global",
          payload ? JSON.stringify(payload) : null,
          result,
          errorMessage,
        ],
      ),
    );
  } catch (err) {
    logger.error("appendIamAudit failed", {
      err: err instanceof Error ? err.message : String(err),
      action,
    });
  }
}

export async function listIamAudit(args: {
  limit?: number;
  offset?: number;
  targetType?: string;
  targetId?: string;
  actor?: string;
  since?: Date;
} = {}): Promise<IamAuditEntry[]> {
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
  const offset = Math.max(args.offset ?? 0, 0);
  return withIamClient(async (c) => {
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
    if (args.actor) {
      params.push(args.actor);
      where.push(`actor = $${params.length}`);
    }
    if (args.since) {
      params.push(args.since);
      where.push(`ts >= $${params.length}`);
    }
    params.push(limit);
    params.push(offset);
    const sql = `
      SELECT id, ts, actor, action, target_type, target_id, payload, result, error_message
        FROM iam_audit_log
       ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY ts DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await c.query(sql, params);
    return r.rows.map((row) => ({
      id: row.id,
      ts: row.ts.toISOString(),
      actor: row.actor,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      payload: row.payload,
      result: row.result,
      errorMessage: row.error_message,
    }));
  });
}
