/**
 * SMTP profiles — per-brand outgoing mail configuration.
 *
 * Profile = (host, port, secure, username, password, fromAddress, fromName, …).
 * `sendMail` resolves the profile by `profileSlug` (or default), pulls the
 * password (from env via `passwordRef`, fallback `passwordPlain`) and caches
 * the resulting nodemailer transporter per slug.
 *
 * Two profiles are pre-seeded: `myperformance` (default) and
 * `zlecenieserwisowe` (Caseownia / UNIKOM brand). They share the same
 * Postal host but use different credential users + domains.
 */

import { withEmailClient } from "./client";

export interface SmtpProfile {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  /** Env var key (preferred). Resolved at sendMail-time via process.env. */
  passwordRef: string | null;
  /** Plain password stored in DB (only when admin chooses save-in-DB).
   * NOTE: stored unencrypted (encryption is a separate ticket). UI must
   * warn the admin and never echo this back in API responses. */
  passwordPlain: string | null;
  fromAddress: string;
  fromName: string;
  replyTo: string | null;
  postalOrgName: string | null;
  postalServerName: string | null;
  isDefault: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface SmtpProfileInput {
  slug: string;
  name: string;
  description?: string | null;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordRef?: string | null;
  /** Plain password to store. `null` keeps existing, `""` (or undefined) =
   * no change on update. Use undefined to "leave alone". */
  passwordPlain?: string | null;
  fromAddress: string;
  fromName: string;
  replyTo?: string | null;
  postalOrgName?: string | null;
  postalServerName?: string | null;
  isDefault?: boolean;
}

let schemaReady: Promise<void> | null = null;
let seedReady: Promise<void> | null = null;

async function ensureProfileSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = withEmailClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_email_smtp_profiles (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug                TEXT UNIQUE NOT NULL,
        name                TEXT NOT NULL,
        description         TEXT,
        host                TEXT NOT NULL,
        port                INTEGER NOT NULL DEFAULT 465,
        secure              BOOLEAN NOT NULL DEFAULT TRUE,
        username            TEXT NOT NULL,
        password_ref        TEXT,
        password_plain      TEXT,
        from_address        TEXT NOT NULL,
        from_name           TEXT NOT NULL,
        reply_to            TEXT,
        postal_org_name     TEXT,
        postal_server_name  TEXT,
        is_default          BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by          TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS mp_email_smtp_profiles_default_uq
        ON mp_email_smtp_profiles ((is_default)) WHERE is_default = TRUE;
    `);
    // Backfill column on mp_branding (idempotent — separate from
    // ensureSchema to keep migrations local to this feature).
    await c.query(`
      ALTER TABLE mp_branding
        ADD COLUMN IF NOT EXISTS default_smtp_profile_slug TEXT
    `);
  }).catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

export async function ensureDefaultSmtpProfiles(): Promise<void> {
  if (seedReady) return seedReady;
  await ensureProfileSchema();
  seedReady = withEmailClient(async (c) => {
    // myperformance — default profile, password from SMTP_PASSWORD env.
    await c.query(
      `INSERT INTO mp_email_smtp_profiles
         (slug, name, description, host, port, secure, username, password_ref,
          from_address, from_name, postal_org_name, postal_server_name, is_default)
       VALUES ('myperformance',
               'MyPerformance główna',
               'Domyślny profil dla noreply@myperformance.pl. Hasło pobierane z env SMTP_PASSWORD.',
               'smtp-iut9wf1rz9ey54g7lbkje0je',
               25, FALSE, 'main', 'SMTP_PASSWORD',
               'noreply@myperformance.pl', 'MyPerformance',
               'MyPerformance', 'main', TRUE)
       ON CONFLICT (slug) DO NOTHING`,
    );
    // zlecenieserwisowe — Caseownia / UNIKOM brand. Same Postal host,
    // different credential username + domain, password from
    // CONFIRMATION_SMTP_PASSWORD env.
    await c.query(
      `INSERT INTO mp_email_smtp_profiles
         (slug, name, description, host, port, secure, username, password_ref,
          from_address, from_name, postal_org_name, postal_server_name, is_default)
       VALUES ('zlecenieserwisowe',
               'Zlecenie serwisowe (Caseownia)',
               'Profil dla domeny zlecenieserwisowe.pl (UNIKOM S.C.). Hasło z env CONFIRMATION_SMTP_PASSWORD.',
               'smtp-iut9wf1rz9ey54g7lbkje0je',
               25, FALSE, 'zlecenieserwisowe', 'CONFIRMATION_SMTP_PASSWORD',
               'noreply@zlecenieserwisowe.pl', 'Zlecenie serwisowe',
               'Zlecenie serwisowe', 'zlecenieserwisowe', FALSE)
       ON CONFLICT (slug) DO NOTHING`,
    );
  }).catch((err) => {
    seedReady = null;
    throw err;
  });
  return seedReady;
}

export async function listSmtpProfiles(): Promise<SmtpProfile[]> {
  await ensureDefaultSmtpProfiles();
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, slug, name, description, host, port, secure, username,
              password_ref, password_plain, from_address, from_name, reply_to,
              postal_org_name, postal_server_name, is_default,
              updated_at, updated_by
         FROM mp_email_smtp_profiles
         ORDER BY is_default DESC, name`,
    );
    return res.rows.map(rowToProfile);
  });
}

export async function getSmtpProfile(
  slug: string,
): Promise<SmtpProfile | null> {
  await ensureDefaultSmtpProfiles();
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, slug, name, description, host, port, secure, username,
              password_ref, password_plain, from_address, from_name, reply_to,
              postal_org_name, postal_server_name, is_default,
              updated_at, updated_by
         FROM mp_email_smtp_profiles WHERE slug = $1`,
      [slug],
    );
    return res.rows[0] ? rowToProfile(res.rows[0]) : null;
  });
}

export async function getDefaultSmtpProfile(): Promise<SmtpProfile | null> {
  await ensureDefaultSmtpProfiles();
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, slug, name, description, host, port, secure, username,
              password_ref, password_plain, from_address, from_name, reply_to,
              postal_org_name, postal_server_name, is_default,
              updated_at, updated_by
         FROM mp_email_smtp_profiles WHERE is_default = TRUE LIMIT 1`,
    );
    return res.rows[0] ? rowToProfile(res.rows[0]) : null;
  });
}

export async function upsertSmtpProfile(
  input: SmtpProfileInput,
  actor: string,
): Promise<SmtpProfile> {
  await ensureDefaultSmtpProfiles();
  return withEmailClient(async (c) => {
    if (input.isDefault) {
      // Single-default invariant — partial unique index forbids two TRUE rows
      // and we want a clean UPDATE-then-INSERT pattern.
      await c.query(`UPDATE mp_email_smtp_profiles SET is_default = FALSE WHERE slug <> $1`, [input.slug]);
    }
    // password_plain semantics:
    //   undefined  → keep existing (use COALESCE with null sentinel)
    //   null       → clear
    //   string ""  → keep existing (UI sends "" for "unchanged")
    //   string "x" → set to "x"
    const passwordPlainParam =
      input.passwordPlain === undefined || input.passwordPlain === ""
        ? null
        : input.passwordPlain;
    const passwordPlainKeep =
      input.passwordPlain === undefined || input.passwordPlain === "";
    const res = await c.query(
      `INSERT INTO mp_email_smtp_profiles
         (slug, name, description, host, port, secure, username, password_ref,
          password_plain, from_address, from_name, reply_to,
          postal_org_name, postal_server_name, is_default, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         host = EXCLUDED.host,
         port = EXCLUDED.port,
         secure = EXCLUDED.secure,
         username = EXCLUDED.username,
         password_ref = EXCLUDED.password_ref,
         password_plain = CASE WHEN $17::boolean THEN mp_email_smtp_profiles.password_plain
                               ELSE EXCLUDED.password_plain END,
         from_address = EXCLUDED.from_address,
         from_name = EXCLUDED.from_name,
         reply_to = EXCLUDED.reply_to,
         postal_org_name = EXCLUDED.postal_org_name,
         postal_server_name = EXCLUDED.postal_server_name,
         is_default = EXCLUDED.is_default,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING id, slug, name, description, host, port, secure, username,
                 password_ref, password_plain, from_address, from_name, reply_to,
                 postal_org_name, postal_server_name, is_default,
                 updated_at, updated_by`,
      [
        input.slug,
        input.name,
        input.description ?? null,
        input.host,
        input.port,
        !!input.secure,
        input.username,
        input.passwordRef ?? null,
        passwordPlainParam,
        input.fromAddress,
        input.fromName,
        input.replyTo ?? null,
        input.postalOrgName ?? null,
        input.postalServerName ?? null,
        !!input.isDefault,
        actor,
        passwordPlainKeep,
      ],
    );
    return rowToProfile(res.rows[0]);
  });
}

export async function deleteSmtpProfile(
  slug: string,
  _actor: string,
): Promise<void> {
  await ensureDefaultSmtpProfiles();
  await withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT is_default FROM mp_email_smtp_profiles WHERE slug = $1`,
      [slug],
    );
    if (!res.rows[0]) return;
    if (res.rows[0].is_default) {
      throw new Error("Cannot delete default SMTP profile");
    }
    await c.query(`DELETE FROM mp_email_smtp_profiles WHERE slug = $1`, [slug]);
  });
}

interface SmtpProfileRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password_ref: string | null;
  password_plain: string | null;
  from_address: string;
  from_name: string;
  reply_to: string | null;
  postal_org_name: string | null;
  postal_server_name: string | null;
  is_default: boolean;
  updated_at: Date;
  updated_by: string | null;
}

function rowToProfile(r: SmtpProfileRow): SmtpProfile {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    host: r.host,
    port: r.port,
    secure: r.secure,
    username: r.username,
    passwordRef: r.password_ref,
    passwordPlain: r.password_plain,
    fromAddress: r.from_address,
    fromName: r.from_name,
    replyTo: r.reply_to,
    postalOrgName: r.postal_org_name,
    postalServerName: r.postal_server_name,
    isDefault: r.is_default,
    updatedAt: r.updated_at.toISOString(),
    updatedBy: r.updated_by,
  };
}
