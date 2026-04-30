import { withEmailClient } from "./client";

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
