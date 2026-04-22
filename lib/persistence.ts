import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { Pool, type PoolClient } from "pg";
import { getOptionalEnv } from "@/lib/env";
import type { IssuedCertificate } from "@/lib/step-ca-types";
import type {
  DeviceFingerprintComponents,
  FingerprintDiff,
} from "@/lib/device-fingerprint";

export type AuditEvent = {
  ts: string;
  actor: string;
  action: string;
  subject?: string;
  ok: boolean;
  error?: string;
};

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabaseUrl(): string | null {
  const url = getOptionalEnv("DATABASE_URL").trim();
  return url.length > 0 ? url : null;
}

function getPool(): Pool | null {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (err) => {
      console.error("[persistence] pg pool error:", err.message);
    });
  }
  return pool;
}

async function ensureSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS issued_certificates (
      id             TEXT PRIMARY KEY,
      subject        TEXT NOT NULL,
      role           TEXT NOT NULL,
      roles          TEXT[] NULL,
      email          TEXT NOT NULL,
      serial_number  TEXT NOT NULL,
      not_after      TIMESTAMPTZ NOT NULL,
      issued_at      TIMESTAMPTZ NOT NULL,
      revoked_at     TIMESTAMPTZ NULL,
      revoked_reason TEXT NULL,
      hidden_at      TIMESTAMPTZ NULL
    );
    ALTER TABLE issued_certificates
      ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ NULL;
    CREATE INDEX IF NOT EXISTS issued_certificates_issued_at_idx
      ON issued_certificates (issued_at DESC);

    CREATE TABLE IF NOT EXISTS audit_events (
      id      BIGSERIAL PRIMARY KEY,
      ts      TIMESTAMPTZ NOT NULL,
      actor   TEXT NOT NULL,
      action  TEXT NOT NULL,
      subject TEXT NULL,
      ok      BOOLEAN NOT NULL,
      error   TEXT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_events_ts_idx
      ON audit_events (ts DESC);

    CREATE TABLE IF NOT EXISTS cert_device_bindings (
      serial_number  TEXT PRIMARY KEY,
      hash           TEXT NOT NULL,
      components     JSONB NOT NULL,
      first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_denied_at TIMESTAMPTZ NULL,
      last_denial    JSONB NULL
    );

    CREATE TABLE IF NOT EXISTS cert_binding_events (
      id             BIGSERIAL PRIMARY KEY,
      ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
      serial_number  TEXT NOT NULL,
      kind           TEXT NOT NULL,
      ip             TEXT NULL,
      user_agent     TEXT NULL,
      components     JSONB NULL,
      diff           JSONB NULL,
      actor          TEXT NULL
    );
    CREATE INDEX IF NOT EXISTS cert_binding_events_serial_ts_idx
      ON cert_binding_events (serial_number, ts DESC);
    CREATE INDEX IF NOT EXISTS cert_binding_events_ts_idx
      ON cert_binding_events (ts DESC);
  `);
}

async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL not configured");
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

function mapRowToCert(r: {
  id: string;
  subject: string;
  role: string;
  roles: string[] | null;
  email: string;
  serial_number: string;
  not_after: Date;
  issued_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
}): IssuedCertificate {
  return {
    id: r.id,
    subject: r.subject,
    role: r.role,
    roles: (r.roles ?? undefined) as IssuedCertificate["roles"],
    email: r.email,
    serialNumber: r.serial_number,
    notAfter: r.not_after.toISOString(),
    issuedAt: r.issued_at.toISOString(),
    revokedAt: r.revoked_at ? r.revoked_at.toISOString() : undefined,
    revokedReason: r.revoked_reason ?? undefined,
  };
}

function getFsRegistryPath(): string {
  return getOptionalEnv("CERT_REGISTRY_PATH", "./.data/certs.json");
}

function getFsAuditPath(): string {
  return getOptionalEnv("AUDIT_LOG_PATH", "./.data/audit.log");
}

async function fsRecordCertificate(meta: IssuedCertificate): Promise<void> {
  const path = getFsRegistryPath();
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.appendFile(path, JSON.stringify(meta) + "\n", "utf8");
}

async function fsListCertificates(): Promise<IssuedCertificate[]> {
  const path = getFsRegistryPath();
  let content: string;
  try {
    content = await fs.readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const byId = new Map<string, IssuedCertificate>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as IssuedCertificate;
      const existing = byId.get(entry.id);
      byId.set(entry.id, existing ? { ...existing, ...entry } : entry);
    } catch {
      // skip malformed
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

async function fsAppendAudit(ev: AuditEvent): Promise<void> {
  const path = getFsAuditPath();
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.appendFile(path, JSON.stringify(ev) + "\n", "utf8");
}

async function fsTailAudit(n: number): Promise<AuditEvent[]> {
  const path = getFsAuditPath();
  let content: string;
  try {
    content = await fs.readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const tail = lines.slice(-n);
  const events: AuditEvent[] = [];
  for (const line of tail) {
    try {
      events.push(JSON.parse(line) as AuditEvent);
    } catch {
      // skip
    }
  }
  return events.reverse();
}

export async function recordCertificate(meta: IssuedCertificate): Promise<void> {
  if (!getDatabaseUrl()) {
    await fsRecordCertificate(meta);
    return;
  }
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO issued_certificates
         (id, subject, role, roles, email, serial_number, not_after, issued_at, revoked_at, revoked_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         subject = EXCLUDED.subject,
         role = EXCLUDED.role,
         roles = EXCLUDED.roles,
         email = EXCLUDED.email,
         serial_number = EXCLUDED.serial_number,
         not_after = EXCLUDED.not_after,
         issued_at = EXCLUDED.issued_at,
         revoked_at = EXCLUDED.revoked_at,
         revoked_reason = EXCLUDED.revoked_reason`,
      [
        meta.id,
        meta.subject,
        meta.role,
        meta.roles ?? null,
        meta.email,
        meta.serialNumber,
        meta.notAfter,
        meta.issuedAt,
        meta.revokedAt ?? null,
        meta.revokedReason ?? null,
      ]
    );
  });
}

export async function listCertificates(): Promise<IssuedCertificate[]> {
  if (!getDatabaseUrl()) return fsListCertificates();
  return withClient(async (c) => {
    const res = await c.query(
      `SELECT id, subject, role, roles, email, serial_number, not_after, issued_at, revoked_at, revoked_reason
       FROM issued_certificates
       WHERE hidden_at IS NULL
       ORDER BY issued_at DESC`
    );
    return res.rows.map(mapRowToCert);
  });
}

export async function hideCertificate(id: string): Promise<void> {
  if (!getDatabaseUrl()) return;
  await withClient(async (c) => {
    await c.query(
      `UPDATE issued_certificates SET hidden_at = now() WHERE id = $1`,
      [id],
    );
  });
}

export async function findCertificateBySerial(
  serial: string
): Promise<IssuedCertificate | null> {
  if (!getDatabaseUrl()) {
    return (await fsListCertificates()).find((c) => c.id === serial || c.serialNumber === serial) ?? null;
  }
  return withClient(async (c) => {
    const res = await c.query(
      `SELECT id, subject, role, roles, email, serial_number, not_after, issued_at, revoked_at, revoked_reason
       FROM issued_certificates
       WHERE id = $1 OR serial_number = $1
       LIMIT 1`,
      [serial]
    );
    return res.rows.length === 0 ? null : mapRowToCert(res.rows[0]);
  });
}

export async function appendAudit(ev: AuditEvent): Promise<void> {
  if (!getDatabaseUrl()) {
    await fsAppendAudit(ev);
    return;
  }
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO audit_events (ts, actor, action, subject, ok, error)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ev.ts, ev.actor, ev.action, ev.subject ?? null, ev.ok, ev.error ?? null]
    );
  });
}

export interface CertDeviceBinding {
  serialNumber: string;
  hash: string;
  components: DeviceFingerprintComponents;
  firstSeenAt: string;
  lastSeenAt: string;
  lastDeniedAt?: string;
  lastDenial?: {
    at: string;
    ip?: string;
    userAgent?: string;
    diff: FingerprintDiff[];
  };
}

function mapRowToBinding(r: {
  serial_number: string;
  hash: string;
  components: DeviceFingerprintComponents;
  first_seen_at: Date;
  last_seen_at: Date;
  last_denied_at: Date | null;
  last_denial: CertDeviceBinding["lastDenial"] | null;
}): CertDeviceBinding {
  return {
    serialNumber: r.serial_number,
    hash: r.hash,
    components: r.components,
    firstSeenAt: r.first_seen_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
    lastDeniedAt: r.last_denied_at ? r.last_denied_at.toISOString() : undefined,
    lastDenial: r.last_denial ?? undefined,
  };
}

export async function getDeviceBinding(
  serial: string,
): Promise<CertDeviceBinding | null> {
  if (!getDatabaseUrl()) return null;
  return withClient(async (c) => {
    const res = await c.query(
      `SELECT serial_number, hash, components, first_seen_at, last_seen_at,
              last_denied_at, last_denial
         FROM cert_device_bindings
         WHERE serial_number = $1
         LIMIT 1`,
      [serial],
    );
    return res.rows.length === 0 ? null : mapRowToBinding(res.rows[0]);
  });
}

export async function upsertDeviceBinding(
  serial: string,
  hash: string,
  components: DeviceFingerprintComponents,
): Promise<void> {
  if (!getDatabaseUrl()) return;
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO cert_device_bindings (serial_number, hash, components)
       VALUES ($1, $2, $3)
       ON CONFLICT (serial_number) DO UPDATE SET
         last_seen_at = now()
      `,
      [serial, hash, JSON.stringify(components)],
    );
  });
}

export async function recordDeviceBindingDenial(
  serial: string,
  diff: FingerprintDiff[],
  ip?: string,
  userAgent?: string,
): Promise<void> {
  if (!getDatabaseUrl()) return;
  await withClient(async (c) => {
    const denial = {
      at: new Date().toISOString(),
      ip,
      userAgent,
      diff,
    };
    await c.query(
      `UPDATE cert_device_bindings
          SET last_denied_at = now(), last_denial = $2
        WHERE serial_number = $1`,
      [serial, JSON.stringify(denial)],
    );
  });
}

export async function resetDeviceBinding(serial: string): Promise<void> {
  if (!getDatabaseUrl()) return;
  await withClient(async (c) => {
    await c.query(
      `DELETE FROM cert_device_bindings WHERE serial_number = $1`,
      [serial],
    );
  });
}

export interface CertBindingEventRow {
  id: string;
  ts: string;
  serialNumber: string;
  kind: "created" | "seen" | "denied" | "reset";
  ip?: string;
  userAgent?: string;
  components?: DeviceFingerprintComponents;
  diff?: FingerprintDiff[];
  actor?: string;
}

export async function recordBindingEvent(args: {
  serialNumber: string;
  kind: CertBindingEventRow["kind"];
  ip?: string;
  userAgent?: string;
  components?: DeviceFingerprintComponents;
  diff?: FingerprintDiff[];
  actor?: string;
}): Promise<void> {
  if (!getDatabaseUrl()) return;
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO cert_binding_events
         (serial_number, kind, ip, user_agent, components, diff, actor)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        args.serialNumber,
        args.kind,
        args.ip ?? null,
        args.userAgent ?? null,
        args.components ? JSON.stringify(args.components) : null,
        args.diff ? JSON.stringify(args.diff) : null,
        args.actor ?? null,
      ],
    );
  });
}

export async function listRecentBindingEvents(args: {
  afterId?: string | null;
  limit?: number;
}): Promise<CertBindingEventRow[]> {
  if (!getDatabaseUrl()) return [];
  const after = args.afterId ?? "0";
  const limit = Math.min(args.limit ?? 200, 500);
  return withClient(async (c) => {
    const res = await c.query(
      `SELECT id, ts, serial_number, kind, ip, user_agent, components, diff, actor
         FROM cert_binding_events
        WHERE id > $1::bigint
        ORDER BY id ASC
        LIMIT $2`,
      [after, limit],
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      ts: (r.ts as Date).toISOString(),
      serialNumber: r.serial_number as string,
      kind: r.kind as CertBindingEventRow["kind"],
      ip: (r.ip as string | null) ?? undefined,
      userAgent: (r.user_agent as string | null) ?? undefined,
      components:
        (r.components as DeviceFingerprintComponents | null) ?? undefined,
      diff: (r.diff as FingerprintDiff[] | null) ?? undefined,
      actor: (r.actor as string | null) ?? undefined,
    }));
  });
}

export async function listBindingEvents(
  serial: string,
  limit = 50,
): Promise<CertBindingEventRow[]> {
  if (!getDatabaseUrl()) return [];
  return withClient(async (c) => {
    const res = await c.query(
      `SELECT id, ts, serial_number, kind, ip, user_agent, components, diff, actor
         FROM cert_binding_events
        WHERE serial_number = $1
        ORDER BY ts DESC
        LIMIT $2`,
      [serial, limit],
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      ts: (r.ts as Date).toISOString(),
      serialNumber: r.serial_number as string,
      kind: r.kind as CertBindingEventRow["kind"],
      ip: (r.ip as string | null) ?? undefined,
      userAgent: (r.user_agent as string | null) ?? undefined,
      components:
        (r.components as DeviceFingerprintComponents | null) ?? undefined,
      diff: (r.diff as FingerprintDiff[] | null) ?? undefined,
      actor: (r.actor as string | null) ?? undefined,
    }));
  });
}

export async function tailAudit(n: number): Promise<AuditEvent[]> {
  if (!getDatabaseUrl()) return fsTailAudit(n);
  return withClient(async (c) => {
    const res = await c.query(
      `SELECT ts, actor, action, subject, ok, error
       FROM audit_events
       ORDER BY ts DESC
       LIMIT $1`,
      [n]
    );
    return res.rows.map((r) => ({
      ts: (r.ts as Date).toISOString(),
      actor: r.actor as string,
      action: r.action as string,
      subject: (r.subject as string | null) ?? undefined,
      ok: r.ok as boolean,
      error: (r.error as string | null) ?? undefined,
    }));
  });
}
