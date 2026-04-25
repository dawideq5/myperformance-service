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

    -- Globalne layouty (szkielety) maili — header MyPerformance + slot {{content}}.
    CREATE TABLE IF NOT EXISTS mp_email_layouts (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      description  TEXT,
      html         TEXT NOT NULL,
      is_default   BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by   TEXT
    );

    -- Aliasy SMTP (np. transactional/marketing/system) → mapowane na Postal
    -- credential. Per template wybieramy alias.
    CREATE TABLE IF NOT EXISTS mp_smtp_configs (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alias             TEXT NOT NULL UNIQUE,
      label             TEXT NOT NULL,
      smtp_host         TEXT NOT NULL,
      smtp_port         INT NOT NULL DEFAULT 25,
      smtp_user         TEXT,
      smtp_password     TEXT,
      use_tls           BOOLEAN NOT NULL DEFAULT FALSE,
      from_email        TEXT NOT NULL,
      from_display      TEXT,
      reply_to          TEXT,
      postal_server_id  INT,
      is_default        BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by        TEXT
    );

    -- Szablony per actionKey (z templates-catalog.ts).
    CREATE TABLE IF NOT EXISTS mp_email_templates (
      action_key       TEXT PRIMARY KEY,
      enabled          BOOLEAN NOT NULL DEFAULT TRUE,
      subject          TEXT NOT NULL,
      body             TEXT NOT NULL,
      layout_id        UUID REFERENCES mp_email_layouts(id) ON DELETE SET NULL,
      smtp_config_id   UUID REFERENCES mp_smtp_configs(id) ON DELETE SET NULL,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by       TEXT
    );
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

// ── Layouts ─────────────────────────────────────────────────────────────────

export interface EmailLayout {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  html: string;
  isDefault: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

const DEFAULT_LAYOUT_HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{subject}}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;background:#000000;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.5px;">{{brand.name}}</h1>
            </td>
          </tr>
          <!-- Body slot -->
          <tr>
            <td style="padding:36px 40px;line-height:1.6;font-size:15px;color:#1a1a1a;">
              {{content}}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background:#fafafa;border-top:1px solid #e5e5e5;color:#737373;font-size:12px;line-height:1.5;">
              <p style="margin:0 0 8px 0;">
                Ta wiadomość została wysłana przez <a href="{{brand.url}}" style="color:#000;text-decoration:underline;">{{brand.name}}</a>.
              </p>
              <p style="margin:0;">
                Pomoc: <a href="mailto:{{brand.supportEmail}}" style="color:#000;text-decoration:underline;">{{brand.supportEmail}}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export async function ensureDefaultLayout(): Promise<void> {
  await withEmailClient(async (c) => {
    await c.query(
      `INSERT INTO mp_email_layouts (slug, name, description, html, is_default)
       VALUES ('default', 'MyPerformance domyślny', 'Standardowy szkielet z czarnym headerem MyPerformance, białym tłem treści i szarą stopką. Slot {{content}} dla treści.', $1, TRUE)
       ON CONFLICT (slug) DO NOTHING`,
      [DEFAULT_LAYOUT_HTML],
    );
  });
}

export async function listLayouts(): Promise<EmailLayout[]> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, slug, name, description, html, is_default, updated_at, updated_by
         FROM mp_email_layouts ORDER BY is_default DESC, name`,
    );
    return res.rows.map(rowToLayout);
  });
}

export async function getDefaultLayout(): Promise<EmailLayout | null> {
  await ensureDefaultLayout();
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, slug, name, description, html, is_default, updated_at, updated_by
         FROM mp_email_layouts WHERE is_default = TRUE LIMIT 1`,
    );
    return res.rows[0] ? rowToLayout(res.rows[0]) : null;
  });
}

export async function getLayout(id: string): Promise<EmailLayout | null> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, slug, name, description, html, is_default, updated_at, updated_by
         FROM mp_email_layouts WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? rowToLayout(res.rows[0]) : null;
  });
}

export async function upsertLayout(args: {
  slug: string;
  name: string;
  description?: string | null;
  html: string;
  isDefault?: boolean;
  actor: string;
}): Promise<EmailLayout> {
  return withEmailClient(async (c) => {
    if (args.isDefault) {
      await c.query(`UPDATE mp_email_layouts SET is_default = FALSE`);
    }
    const res = await c.query(
      `INSERT INTO mp_email_layouts (slug, name, description, html, is_default, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         html = EXCLUDED.html,
         is_default = EXCLUDED.is_default,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING id, slug, name, description, html, is_default, updated_at, updated_by`,
      [
        args.slug,
        args.name,
        args.description ?? null,
        args.html,
        !!args.isDefault,
        args.actor,
      ],
    );
    return rowToLayout(res.rows[0]);
  });
}

interface LayoutRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  html: string;
  is_default: boolean;
  updated_at: Date;
  updated_by: string | null;
}

function rowToLayout(r: LayoutRow): EmailLayout {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    html: r.html,
    isDefault: r.is_default,
    updatedAt: r.updated_at.toISOString(),
    updatedBy: r.updated_by,
  };
}

// ── SMTP Configs ────────────────────────────────────────────────────────────

export interface SmtpConfig {
  id: string;
  alias: string;
  label: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string | null;
  smtpPassword: string | null;
  useTls: boolean;
  fromEmail: string;
  fromDisplay: string | null;
  replyTo: string | null;
  postalServerId: number | null;
  isDefault: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export async function ensureDefaultSmtpConfig(): Promise<void> {
  await withEmailClient(async (c) => {
    await c.query(
      `INSERT INTO mp_smtp_configs
         (alias, label, smtp_host, smtp_port, smtp_user, smtp_password, use_tls, from_email, from_display, reply_to, is_default)
       VALUES ('transactional', 'Transactional (Postal)', $1, $2, $3, $4, $5, $6, 'MyPerformance', $6, TRUE)
       ON CONFLICT (alias) DO NOTHING`,
      [
        process.env.SMTP_HOST ?? "smtp-iut9wf1rz9ey54g7lbkje0je",
        Number(process.env.SMTP_PORT ?? 25),
        process.env.SMTP_USER ?? null,
        process.env.SMTP_PASSWORD ?? null,
        false,
        "noreply@myperformance.pl",
      ],
    );
  });
}

export async function listSmtpConfigs(): Promise<SmtpConfig[]> {
  await ensureDefaultSmtpConfig();
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, alias, label, smtp_host, smtp_port, smtp_user, smtp_password,
              use_tls, from_email, from_display, reply_to, postal_server_id,
              is_default, updated_at, updated_by
         FROM mp_smtp_configs ORDER BY is_default DESC, label`,
    );
    return res.rows.map(rowToSmtp);
  });
}

export async function getDefaultSmtpConfig(): Promise<SmtpConfig | null> {
  await ensureDefaultSmtpConfig();
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, alias, label, smtp_host, smtp_port, smtp_user, smtp_password,
              use_tls, from_email, from_display, reply_to, postal_server_id,
              is_default, updated_at, updated_by
         FROM mp_smtp_configs WHERE is_default = TRUE LIMIT 1`,
    );
    return res.rows[0] ? rowToSmtp(res.rows[0]) : null;
  });
}

export async function getSmtpConfig(id: string): Promise<SmtpConfig | null> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, alias, label, smtp_host, smtp_port, smtp_user, smtp_password,
              use_tls, from_email, from_display, reply_to, postal_server_id,
              is_default, updated_at, updated_by
         FROM mp_smtp_configs WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? rowToSmtp(res.rows[0]) : null;
  });
}

export async function upsertSmtpConfig(args: {
  alias: string;
  label: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  useTls?: boolean;
  fromEmail: string;
  fromDisplay?: string | null;
  replyTo?: string | null;
  postalServerId?: number | null;
  isDefault?: boolean;
  actor: string;
}): Promise<SmtpConfig> {
  return withEmailClient(async (c) => {
    if (args.isDefault) {
      await c.query(`UPDATE mp_smtp_configs SET is_default = FALSE`);
    }
    const res = await c.query(
      `INSERT INTO mp_smtp_configs
         (alias, label, smtp_host, smtp_port, smtp_user, smtp_password, use_tls,
          from_email, from_display, reply_to, postal_server_id, is_default, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (alias) DO UPDATE SET
         label = EXCLUDED.label,
         smtp_host = EXCLUDED.smtp_host,
         smtp_port = EXCLUDED.smtp_port,
         smtp_user = EXCLUDED.smtp_user,
         smtp_password = EXCLUDED.smtp_password,
         use_tls = EXCLUDED.use_tls,
         from_email = EXCLUDED.from_email,
         from_display = EXCLUDED.from_display,
         reply_to = EXCLUDED.reply_to,
         postal_server_id = EXCLUDED.postal_server_id,
         is_default = EXCLUDED.is_default,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING id, alias, label, smtp_host, smtp_port, smtp_user, smtp_password,
                 use_tls, from_email, from_display, reply_to, postal_server_id,
                 is_default, updated_at, updated_by`,
      [
        args.alias,
        args.label,
        args.smtpHost,
        args.smtpPort,
        args.smtpUser ?? null,
        args.smtpPassword ?? null,
        !!args.useTls,
        args.fromEmail,
        args.fromDisplay ?? null,
        args.replyTo ?? null,
        args.postalServerId ?? null,
        !!args.isDefault,
        args.actor,
      ],
    );
    return rowToSmtp(res.rows[0]);
  });
}

export async function deleteSmtpConfig(id: string): Promise<void> {
  await withEmailClient((c) =>
    c.query(`DELETE FROM mp_smtp_configs WHERE id = $1 AND is_default = FALSE`, [id]),
  );
}

interface SmtpRow {
  id: string;
  alias: string;
  label: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string | null;
  smtp_password: string | null;
  use_tls: boolean;
  from_email: string;
  from_display: string | null;
  reply_to: string | null;
  postal_server_id: number | null;
  is_default: boolean;
  updated_at: Date;
  updated_by: string | null;
}

function rowToSmtp(r: SmtpRow): SmtpConfig {
  return {
    id: r.id,
    alias: r.alias,
    label: r.label,
    smtpHost: r.smtp_host,
    smtpPort: r.smtp_port,
    smtpUser: r.smtp_user,
    smtpPassword: r.smtp_password,
    useTls: r.use_tls,
    fromEmail: r.from_email,
    fromDisplay: r.from_display,
    replyTo: r.reply_to,
    postalServerId: r.postal_server_id,
    isDefault: r.is_default,
    updatedAt: r.updated_at.toISOString(),
    updatedBy: r.updated_by,
  };
}

// ── Email Templates ─────────────────────────────────────────────────────────

export interface EmailTemplate {
  actionKey: string;
  enabled: boolean;
  subject: string;
  body: string;
  layoutId: string | null;
  smtpConfigId: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export async function getTemplate(actionKey: string): Promise<EmailTemplate | null> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT action_key, enabled, subject, body, layout_id, smtp_config_id, updated_at, updated_by
         FROM mp_email_templates WHERE action_key = $1`,
      [actionKey],
    );
    return res.rows[0] ? rowToTemplate(res.rows[0]) : null;
  });
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT action_key, enabled, subject, body, layout_id, smtp_config_id, updated_at, updated_by
         FROM mp_email_templates ORDER BY action_key`,
    );
    return res.rows.map(rowToTemplate);
  });
}

export async function upsertTemplate(args: {
  actionKey: string;
  enabled?: boolean;
  subject: string;
  body: string;
  layoutId?: string | null;
  smtpConfigId?: string | null;
  actor: string;
}): Promise<EmailTemplate> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `INSERT INTO mp_email_templates
         (action_key, enabled, subject, body, layout_id, smtp_config_id, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (action_key) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         subject = EXCLUDED.subject,
         body = EXCLUDED.body,
         layout_id = EXCLUDED.layout_id,
         smtp_config_id = EXCLUDED.smtp_config_id,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING action_key, enabled, subject, body, layout_id, smtp_config_id, updated_at, updated_by`,
      [
        args.actionKey,
        args.enabled !== false,
        args.subject,
        args.body,
        args.layoutId ?? null,
        args.smtpConfigId ?? null,
        args.actor,
      ],
    );
    return rowToTemplate(res.rows[0]);
  });
}

export async function deleteTemplate(actionKey: string): Promise<void> {
  await withEmailClient((c) =>
    c.query(`DELETE FROM mp_email_templates WHERE action_key = $1`, [actionKey]),
  );
}

interface TemplateRow {
  action_key: string;
  enabled: boolean;
  subject: string;
  body: string;
  layout_id: string | null;
  smtp_config_id: string | null;
  updated_at: Date;
  updated_by: string | null;
}

function rowToTemplate(r: TemplateRow): EmailTemplate {
  return {
    actionKey: r.action_key,
    enabled: r.enabled,
    subject: r.subject,
    body: r.body,
    layoutId: r.layout_id,
    smtpConfigId: r.smtp_config_id,
    updatedAt: r.updated_at.toISOString(),
    updatedBy: r.updated_by,
  };
}
