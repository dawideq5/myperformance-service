import { type PoolClient } from "pg";

/**
 * Schema for email / branding / postal admin features.
 *
 * Tabele:
 *   - mp_branding             — singleton (id=1) z globalnymi brand vars
 *   - mp_kc_localization      — overrides KC localization (subjects + bodies)
 *   - mp_postal_audit         — append-only audit Postal admin operations
 *   - mp_email_layouts        — szkielety (header/footer wrapper)
 *   - mp_smtp_configs         — aliasy SMTP per template (transactional/marketing/system)
 *   - mp_email_templates      — szablony per actionKey
 *   - mp_ovh_config           — singleton OVH API config
 *   - mp_2fa_codes            — email-based 2FA (krótkotrwałe)
 *   - mp_devices              — device fingerprinting (per-device cookie)
 *   - mp_device_sightings     — sighting log per (device,user,ip)
 *   - mp_user_preferences     — singleton-per-user JSON
 *   - mp_device_theme         — theme per device
 *   - mp_inbox                — in-app inbox per user
 *   - mp_ip_geo               — geolocation cache per IP
 *   - mp_blocked_ips          — manual + auto blocklist
 *   - mp_security_events      — agregowane security events
 */

export async function ensureSchema(client: PoolClient): Promise<void> {
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
