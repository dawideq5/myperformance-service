import { type PoolClient } from "pg";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { getPool } from "@/lib/db";

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

let schemaReady: Promise<void> | null = null;

function getDatabaseUrl(): string | null {
  const url = getOptionalEnv("DATABASE_URL").trim();
  return url.length > 0 ? url : null;
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

    -- OVH Cloud credentials — singleton (id=1).
    CREATE TABLE IF NOT EXISTS mp_ovh_config (
      id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      endpoint      TEXT NOT NULL DEFAULT 'ovh-eu',
      app_key       TEXT,
      app_secret    TEXT,
      consumer_key  TEXT,
      enabled       BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by    TEXT
    );
    INSERT INTO mp_ovh_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

    -- Email-based 2FA codes (krótkotrwałe, jednorazowe).
    CREATE TABLE IF NOT EXISTS mp_2fa_codes (
      id          BIGSERIAL PRIMARY KEY,
      user_id     TEXT NOT NULL,
      email       TEXT NOT NULL,
      code_hash   TEXT NOT NULL,
      purpose     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL,
      used_at     TIMESTAMPTZ,
      attempts    INT NOT NULL DEFAULT 0,
      src_ip      TEXT
    );
    CREATE INDEX IF NOT EXISTS mp_2fa_codes_user_idx
      ON mp_2fa_codes (user_id, expires_at);
    CREATE INDEX IF NOT EXISTS mp_2fa_codes_cleanup_idx
      ON mp_2fa_codes (expires_at) WHERE used_at IS NULL;

    -- Device fingerprinting: per-device cookie + sighting log per (device,user,ip).
    CREATE TABLE IF NOT EXISTS mp_devices (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_agent   TEXT,
      trusted      BOOLEAN NOT NULL DEFAULT FALSE,
      label        TEXT
    );

    CREATE TABLE IF NOT EXISTS mp_device_sightings (
      id           BIGSERIAL PRIMARY KEY,
      device_id    UUID NOT NULL REFERENCES mp_devices(id) ON DELETE CASCADE,
      user_id      TEXT,
      user_email   TEXT,
      ip           TEXT,
      ua_hash      TEXT,
      seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      path         TEXT,
      request_id   TEXT
    );
    CREATE INDEX IF NOT EXISTS mp_device_sightings_device_idx ON mp_device_sightings (device_id, seen_at DESC);
    CREATE INDEX IF NOT EXISTS mp_device_sightings_user_idx ON mp_device_sightings (user_id, seen_at DESC);
    CREATE INDEX IF NOT EXISTS mp_device_sightings_ip_idx ON mp_device_sightings (ip, seen_at DESC);
    CREATE INDEX IF NOT EXISTS mp_device_sightings_seen_idx ON mp_device_sightings (seen_at DESC);

    -- Per-user preferences — singleton-per-user JSON. Klucze:
    -- hints_enabled (bool), notif_in_app (jsonb event types), notif_email (jsonb)
    -- intro_completed_steps (jsonb array stepIds), moodle_course_id (number).
    CREATE TABLE IF NOT EXISTS mp_user_preferences (
      user_id     TEXT PRIMARY KEY,
      prefs       JSONB NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Theme preference per device (identyfikacja po HMAC-signed mp_did
    -- cookie). Pozwala każdemu urządzeniu mieć własny tryb (jasny/ciemny)
    -- niezależnie od user-konta. Read przed paint w app/layout.tsx.
    CREATE TABLE IF NOT EXISTS mp_device_theme (
      device_id   TEXT PRIMARY KEY,
      theme       TEXT NOT NULL CHECK (theme IN ('light', 'dark')),
      ip          TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- In-app inbox per user. Konsumowane przez badge w UI + auto-toast
    -- po wczytaniu strony. Read = read_at IS NOT NULL. Retencja 30 dni
    -- (cron czyszczący w lib/security/jobs).
    CREATE TABLE IF NOT EXISTS mp_inbox (
      id          BIGSERIAL PRIMARY KEY,
      user_id     TEXT NOT NULL,
      event_key   TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'info',
      payload     JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at     TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS mp_inbox_user_unread_idx
      ON mp_inbox (user_id, created_at DESC) WHERE read_at IS NULL;
    CREATE INDEX IF NOT EXISTS mp_inbox_cleanup_idx
      ON mp_inbox (created_at);

    -- Cache geolocation per IP — populowane on-demand z zewnętrznego API
    -- (ipapi.co, free 1000/day). TTL 30 dni przez cleanup.
    CREATE TABLE IF NOT EXISTS mp_ip_geo (
      ip          TEXT PRIMARY KEY,
      country     TEXT,
      country_code TEXT,
      city        TEXT,
      region      TEXT,
      asn         TEXT,
      org         TEXT,
      lat         DOUBLE PRECISION,
      lng         DOUBLE PRECISION,
      looked_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      error       TEXT
    );
    CREATE INDEX IF NOT EXISTS mp_ip_geo_country_idx ON mp_ip_geo (country_code);

    -- Blocked IPs — Active Response (manual + auto Wazuh w przyszłości).
    -- Traefik dynamic file generowany na podstawie tej tabeli przez cron.
    CREATE TABLE IF NOT EXISTS mp_blocked_ips (
      ip          TEXT PRIMARY KEY,
      reason      TEXT NOT NULL,
      blocked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ,
      blocked_by  TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'manual',
      attempts    INT NOT NULL DEFAULT 0,
      country     TEXT,
      details     JSONB
    );
    CREATE INDEX IF NOT EXISTS mp_blocked_ips_expires_idx
      ON mp_blocked_ips (expires_at) WHERE expires_at IS NOT NULL;

    -- Security events — agregacja z różnych źródeł (KC, webhook, Postal,
    -- nasze IAM audit, w przyszłości Wazuh). Insert-only, retencja 90 dni.
    CREATE TABLE IF NOT EXISTS mp_security_events (
      id           BIGSERIAL PRIMARY KEY,
      ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
      severity     TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
      category     TEXT NOT NULL,
      source       TEXT NOT NULL,
      title        TEXT NOT NULL,
      description  TEXT,
      src_ip       TEXT,
      target_user  TEXT,
      details      JSONB,
      acknowledged BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS mp_security_events_ts_idx
      ON mp_security_events (ts DESC);
    CREATE INDEX IF NOT EXISTS mp_security_events_severity_idx
      ON mp_security_events (severity, ts DESC);
    CREATE INDEX IF NOT EXISTS mp_security_events_src_ip_idx
      ON mp_security_events (src_ip);
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
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f4f4f5;
            color: #333333;
            -webkit-font-smoothing: antialiased;
        }
        table { border-spacing: 0; border-collapse: collapse; }
        .email-wrapper { width: 100%; background-color: #f4f4f5; padding: 40px 20px; }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .header {
            background-color: #0c0c0e;
            padding: 35px 20px;
            text-align: center;
        }
        .logo {
            color: #ffffff;
            font-size: 32px;
            font-weight: 800;
            letter-spacing: -0.5px;
            margin: 0;
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        }
        .content {
            padding: 40px 30px;
            line-height: 1.6;
            font-size: 16px;
        }
        .content h1 {
            font-size: 24px;
            color: #111111;
            margin-top: 0;
            margin-bottom: 20px;
        }
        .content p { margin-top: 0; margin-bottom: 20px; color: #444444; }
        .content a { color: #0c0c0e; }
        .content strong { color: #111111; }
        .content ul { margin-top: 0; margin-bottom: 20px; padding-left: 20px; color: #444444; }
        .content li { margin: 4px 0; }
        .button-container { text-align: center; margin: 35px 0 15px 0; }
        .button {
            display: inline-block;
            padding: 14px 28px;
            background-color: #0c0c0e;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            font-size: 16px;
        }
        .footer {
            background-color: #fafafa;
            padding: 30px 40px;
            text-align: center;
            font-size: 14px;
            color: #666666;
            border-top: 1px solid #eeeeee;
            line-height: 1.5;
        }
        .footer a {
            color: #0c0c0e;
            text-decoration: none;
            font-weight: bold;
        }
        .footer a:hover { text-decoration: underline; }
        @media screen and (max-width: 600px) {
            .email-wrapper { padding: 20px 10px; }
            .content { padding: 30px 20px; }
            .footer { padding: 25px 20px; }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <table class="email-container" width="100%" align="center" role="presentation">
            <tr>
                <td class="header">
                    <p class="logo">{{brand.name}}</p>
                </td>
            </tr>
            <tr>
                <td class="content">
                    {{content}}
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <p style="margin: 0 0 5px 0;">Chcesz się z nami skontaktować?</p>
                    <p style="margin: 0;">Napisz na adres: <a href="mailto:{{brand.supportEmail}}">{{brand.supportEmail}}</a></p>
                </td>
            </tr>
        </table>
    </div>
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

// ── OVH Config ──────────────────────────────────────────────────────────────

export interface OvhConfig {
  endpoint: "ovh-eu" | "ovh-us" | "ovh-ca";
  appKey: string | null;
  appSecret: string | null;
  consumerKey: string | null;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export async function getOvhConfig(): Promise<OvhConfig> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT endpoint, app_key, app_secret, consumer_key, enabled, updated_at, updated_by
         FROM mp_ovh_config WHERE id = 1`,
    );
    const r = res.rows[0];
    return {
      endpoint: (r?.endpoint ?? "ovh-eu") as OvhConfig["endpoint"],
      appKey: r?.app_key ?? null,
      appSecret: r?.app_secret ?? null,
      consumerKey: r?.consumer_key ?? null,
      enabled: r?.enabled ?? false,
      updatedAt: r?.updated_at?.toISOString() ?? new Date().toISOString(),
      updatedBy: r?.updated_by ?? null,
    };
  });
}

export async function updateOvhConfig(
  patch: Partial<{
    endpoint: OvhConfig["endpoint"];
    appKey: string | null;
    appSecret: string | null;
    consumerKey: string | null;
    enabled: boolean;
  }>,
  actor: string,
): Promise<OvhConfig> {
  return withEmailClient(async (c) => {
    await c.query(
      `UPDATE mp_ovh_config SET
         endpoint = COALESCE($1, endpoint),
         app_key = COALESCE($2, app_key),
         app_secret = COALESCE($3, app_secret),
         consumer_key = COALESCE($4, consumer_key),
         enabled = COALESCE($5, enabled),
         updated_at = now(),
         updated_by = $6
       WHERE id = 1`,
      [
        patch.endpoint ?? null,
        patch.appKey ?? null,
        patch.appSecret ?? null,
        patch.consumerKey ?? null,
        patch.enabled ?? null,
        actor,
      ],
    );
    return getOvhConfig();
  });
}
