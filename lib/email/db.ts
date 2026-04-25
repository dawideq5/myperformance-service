import { Pool, type PoolClient } from "pg";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

/**
 * Schema for email / branding / postal admin features.
 *
 * Tabele:
 *   - mp_branding             — singleton (id=1) z globalnymi brand vars
 *   - mp_kc_localization      — overrides KC localization (subjects + bodies)
 *   - mp_postal_audit         — append-only audit Postal admin operations
 *   - mp_email_templates_cache  — cache statycznego catalogu (jeśli kiedyś
 *                                  zmienimy na DB-backed dla CRUD)
 */

const logger = log.child({ module: "email-db" });

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabaseUrl(): string | null {
  const url = getOptionalEnv("DATABASE_URL").trim();
  return url.length > 0 ? url : null;
}

function getPool(): Pool {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL not configured");
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 3,
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
    CREATE TABLE IF NOT EXISTS mp_branding (
      id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      brand_name      TEXT NOT NULL DEFAULT 'MyPerformance',
      brand_url       TEXT,
      brand_logo_url  TEXT,
      primary_color   TEXT,
      support_email   TEXT,
      legal_name      TEXT,
      from_display    TEXT,
      reply_to        TEXT,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by      TEXT
    );
    INSERT INTO mp_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS mp_kc_localization (
      locale      TEXT NOT NULL,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by  TEXT,
      PRIMARY KEY (locale, key)
    );

    CREATE TABLE IF NOT EXISTS mp_postal_audit (
      id           BIGSERIAL PRIMARY KEY,
      ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor        TEXT NOT NULL,
      operation    TEXT NOT NULL,
      target_type  TEXT,
      target_id    TEXT,
      status       TEXT NOT NULL CHECK (status IN ('ok','error')),
      details      JSONB,
      error        TEXT
    );
    CREATE INDEX IF NOT EXISTS mp_postal_audit_ts_idx
      ON mp_postal_audit (ts DESC);
  `);
}

export async function withEmailClient<T>(
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

// ── Branding ────────────────────────────────────────────────────────────────

export interface Branding {
  brandName: string;
  brandUrl: string | null;
  brandLogoUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  legalName: string | null;
  fromDisplay: string | null;
  replyTo: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export async function getBranding(): Promise<Branding> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT brand_name, brand_url, brand_logo_url, primary_color,
              support_email, legal_name, from_display, reply_to,
              updated_at, updated_by
         FROM mp_branding WHERE id = 1`,
    );
    const r = res.rows[0];
    return {
      brandName: r.brand_name ?? "MyPerformance",
      brandUrl: r.brand_url,
      brandLogoUrl: r.brand_logo_url,
      primaryColor: r.primary_color,
      supportEmail: r.support_email,
      legalName: r.legal_name,
      fromDisplay: r.from_display,
      replyTo: r.reply_to,
      updatedAt: r.updated_at.toISOString(),
      updatedBy: r.updated_by,
    };
  });
}

export interface BrandingPatch {
  brandName?: string;
  brandUrl?: string | null;
  brandLogoUrl?: string | null;
  primaryColor?: string | null;
  supportEmail?: string | null;
  legalName?: string | null;
  fromDisplay?: string | null;
  replyTo?: string | null;
}

export async function updateBranding(
  patch: BrandingPatch,
  actor: string,
): Promise<Branding> {
  return withEmailClient(async (c) => {
    await c.query(
      `UPDATE mp_branding SET
         brand_name      = COALESCE($1, brand_name),
         brand_url       = COALESCE($2, brand_url),
         brand_logo_url  = COALESCE($3, brand_logo_url),
         primary_color   = COALESCE($4, primary_color),
         support_email   = COALESCE($5, support_email),
         legal_name      = COALESCE($6, legal_name),
         from_display    = COALESCE($7, from_display),
         reply_to        = COALESCE($8, reply_to),
         updated_at      = now(),
         updated_by      = $9
       WHERE id = 1`,
      [
        patch.brandName ?? null,
        patch.brandUrl ?? null,
        patch.brandLogoUrl ?? null,
        patch.primaryColor ?? null,
        patch.supportEmail ?? null,
        patch.legalName ?? null,
        patch.fromDisplay ?? null,
        patch.replyTo ?? null,
        actor,
      ],
    );
    return getBranding();
  });
}

// ── KC localization overrides ───────────────────────────────────────────────

export interface KcLocalizationOverride {
  locale: string;
  key: string;
  value: string;
  updatedAt: string;
  updatedBy: string | null;
}

export async function listKcLocalization(
  locale: string,
): Promise<KcLocalizationOverride[]> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT locale, key, value, updated_at, updated_by
         FROM mp_kc_localization WHERE locale = $1 ORDER BY key`,
      [locale],
    );
    return res.rows.map((r) => ({
      locale: r.locale,
      key: r.key,
      value: r.value,
      updatedAt: r.updated_at.toISOString(),
      updatedBy: r.updated_by,
    }));
  });
}

export async function upsertKcLocalization(
  locale: string,
  key: string,
  value: string,
  actor: string,
): Promise<void> {
  await withEmailClient((c) =>
    c.query(
      `INSERT INTO mp_kc_localization (locale, key, value, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (locale, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [locale, key, value, actor],
    ),
  );
}

export async function deleteKcLocalization(
  locale: string,
  key: string,
): Promise<void> {
  await withEmailClient((c) =>
    c.query(
      `DELETE FROM mp_kc_localization WHERE locale = $1 AND key = $2`,
      [locale, key],
    ),
  );
}

// ── Postal audit ────────────────────────────────────────────────────────────

export interface PostalAuditEntry {
  actor: string;
  operation: string;
  targetType?: string;
  targetId?: string;
  status: "ok" | "error";
  details?: Record<string, unknown>;
  error?: string;
}

export async function appendPostalAudit(entry: PostalAuditEntry): Promise<void> {
  await withEmailClient((c) =>
    c.query(
      `INSERT INTO mp_postal_audit
         (actor, operation, target_type, target_id, status, details, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.actor,
        entry.operation,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.status,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.error ?? null,
      ],
    ),
  );
}
