import mysql from "mysql2/promise";
import { randomBytes } from "crypto";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

/**
 * Postal admin layer — direct MariaDB. Postal Web API jest minimalne
 * (tylko send/messages), więc admin operacje (organizations, servers,
 * credentials, routes, domains) jadą przez DB. Kompatybilne z Postal 3.3.x.
 */

const logger = log.child({ module: "postal-admin" });

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (pool) return pool;
  const url = getOptionalEnv("POSTAL_DB_URL");
  if (!url) throw new Error("POSTAL_DB_URL not configured");
  pool = mysql.createPool({
    uri: url,
    connectionLimit: 3,
    waitForConnections: true,
  });
  return pool;
}

export function isConfigured(): boolean {
  return !!getOptionalEnv("POSTAL_DB_URL");
}

function uuid(): string {
  // Postal używa stringów UUID-like (36 chars, dashes). Generujemy zgodne.
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function permalink(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ── Organizations ───────────────────────────────────────────────────────────

export interface PostalOrganization {
  id: number;
  uuid: string;
  name: string;
  permalink: string;
  timeZone: string | null;
  createdAt: string;
  serverCount: number;
}

export async function listOrganizations(): Promise<PostalOrganization[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT o.id, o.uuid, o.name, o.permalink, o.time_zone, o.created_at,
            (SELECT COUNT(*) FROM servers s WHERE s.organization_id = o.id AND s.deleted_at IS NULL) AS server_count
       FROM organizations o
      WHERE o.deleted_at IS NULL
      ORDER BY o.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    uuid: r.uuid,
    name: r.name,
    permalink: r.permalink,
    timeZone: r.time_zone ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    serverCount: Number(r.server_count) || 0,
  }));
}

export async function createOrganization(args: {
  name: string;
  ownerEmail?: string;
  timeZone?: string;
}): Promise<PostalOrganization> {
  const conn = await getPool().getConnection();
  try {
    let ownerId: number | null = null;
    if (args.ownerEmail) {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT id FROM users WHERE LOWER(email_address) = LOWER(?) LIMIT 1`,
        [args.ownerEmail],
      );
      if (rows[0]) ownerId = rows[0].id;
    }
    const orgUuid = uuid();
    const [res] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO organizations (uuid, name, permalink, time_zone, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [orgUuid, args.name, permalink(args.name), args.timeZone ?? "UTC", ownerId],
    );
    const id = res.insertId;
    return {
      id,
      uuid: orgUuid,
      name: args.name,
      permalink: permalink(args.name),
      timeZone: args.timeZone ?? "UTC",
      createdAt: new Date().toISOString(),
      serverCount: 0,
    };
  } finally {
    conn.release();
  }
}

// ── Servers (per organization) ──────────────────────────────────────────────

export interface PostalServer {
  id: number;
  uuid: string;
  organizationId: number;
  organizationName: string;
  name: string;
  permalink: string;
  mode: string; // 'Live' | 'Development'
  postmasterAddress: string | null;
  sendLimit: number | null;
  suspended: boolean;
  createdAt: string;
}

export async function listServers(orgId?: number): Promise<PostalServer[]> {
  const where = orgId ? `AND s.organization_id = ${Number(orgId)}` : "";
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT s.id, s.uuid, s.organization_id, o.name AS org_name, s.name, s.permalink,
            s.mode, s.postmaster_address, s.send_limit, s.suspended_at, s.created_at
       FROM servers s
       JOIN organizations o ON o.id = s.organization_id
      WHERE s.deleted_at IS NULL ${where}
      ORDER BY o.name, s.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    uuid: r.uuid,
    organizationId: r.organization_id,
    organizationName: r.org_name,
    name: r.name,
    permalink: r.permalink,
    mode: r.mode ?? "Live",
    postmasterAddress: r.postmaster_address,
    sendLimit: r.send_limit,
    suspended: !!r.suspended_at,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function createServer(args: {
  organizationId: number;
  name: string;
  mode?: "Live" | "Development";
  postmasterAddress?: string;
}): Promise<PostalServer> {
  const conn = await getPool().getConnection();
  try {
    const serverUuid = uuid();
    const token = randomBytes(8).toString("hex");
    const [res] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO servers
         (organization_id, uuid, name, permalink, mode, token,
          postmaster_address, message_retention_days, raw_message_retention_days,
          raw_message_retention_size, send_limit, allow_sender, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 30, 7, 200, NULL, 0, NOW(), NOW())`,
      [
        args.organizationId,
        serverUuid,
        args.name,
        permalink(args.name),
        args.mode ?? "Live",
        token,
        args.postmasterAddress ?? null,
      ],
    );
    const [orgRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT name FROM organizations WHERE id = ?`,
      [args.organizationId],
    );
    return {
      id: res.insertId,
      uuid: serverUuid,
      organizationId: args.organizationId,
      organizationName: orgRows[0]?.name ?? "",
      name: args.name,
      permalink: permalink(args.name),
      mode: args.mode ?? "Live",
      postmasterAddress: args.postmasterAddress ?? null,
      sendLimit: null,
      suspended: false,
      createdAt: new Date().toISOString(),
    };
  } finally {
    conn.release();
  }
}

export async function updateServer(
  id: number,
  patch: { postmasterAddress?: string; sendLimit?: number | null; mode?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];
  if (patch.postmasterAddress !== undefined) {
    sets.push("postmaster_address = ?");
    values.push(patch.postmasterAddress);
  }
  if (patch.sendLimit !== undefined) {
    sets.push("send_limit = ?");
    values.push(patch.sendLimit);
  }
  if (patch.mode !== undefined) {
    sets.push("mode = ?");
    values.push(patch.mode);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = NOW()");
  values.push(id);
  await getPool().execute(
    `UPDATE servers SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function deleteServer(id: number): Promise<void> {
  await getPool().execute(
    `UPDATE servers SET deleted_at = NOW() WHERE id = ?`,
    [id],
  );
}

// ── Credentials ─────────────────────────────────────────────────────────────

export interface PostalCredential {
  id: number;
  serverId: number;
  uuid: string;
  type: string; // 'SMTP' | 'API'
  name: string;
  key: string;
  hold: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export async function listCredentials(serverId: number): Promise<PostalCredential[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT id, server_id, uuid, type, name, \`key\`, hold, last_used_at, created_at
       FROM credentials WHERE server_id = ? ORDER BY id DESC`,
    [serverId],
  );
  return rows.map((r) => ({
    id: r.id,
    serverId: r.server_id,
    uuid: r.uuid,
    type: r.type,
    name: r.name,
    key: r.key,
    hold: !!r.hold,
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function createCredential(args: {
  serverId: number;
  type: "SMTP" | "API";
  name: string;
}): Promise<PostalCredential> {
  // Postal SMTP creds: random base32 8-byte key prefixed by user-friendly slug.
  // API keys: longer (24 bytes).
  const key =
    args.type === "SMTP"
      ? randomBytes(8).toString("hex")
      : randomBytes(24).toString("hex");
  const credUuid = uuid();
  const [res] = await getPool().execute<mysql.ResultSetHeader>(
    `INSERT INTO credentials (server_id, uuid, type, name, \`key\`, options, hold, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 0, NOW(), NOW())`,
    [args.serverId, credUuid, args.type, args.name, key],
  );
  return {
    id: res.insertId,
    serverId: args.serverId,
    uuid: credUuid,
    type: args.type,
    name: args.name,
    key,
    hold: false,
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export async function deleteCredential(id: number): Promise<void> {
  await getPool().execute(`DELETE FROM credentials WHERE id = ?`, [id]);
}

// ── Domains ─────────────────────────────────────────────────────────────────

export interface PostalDomain {
  id: number;
  uuid: string;
  serverId: number | null;
  ownerType: string | null;
  ownerId: number | null;
  name: string;
  verificationToken: string | null;
  verifiedAt: string | null;
  spfStatus: string | null;
  dkimStatus: string | null;
  mxStatus: string | null;
  returnPathStatus: string | null;
  dkimIdentifierString: string | null;
  outgoing: boolean;
  incoming: boolean;
  useForAny: boolean;
  createdAt: string;
}

export async function listDomains(serverId?: number): Promise<PostalDomain[]> {
  const where = serverId ? `WHERE server_id = ${Number(serverId)}` : "";
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT id, uuid, server_id, owner_type, owner_id, name,
            verification_token, verified_at,
            spf_status, dkim_status, mx_status, return_path_status,
            dkim_identifier_string, outgoing, incoming, use_for_any, created_at
       FROM domains ${where} ORDER BY name`,
  );
  return rows.map((r) => ({
    id: r.id,
    uuid: r.uuid,
    serverId: r.server_id,
    ownerType: r.owner_type,
    ownerId: r.owner_id,
    name: r.name,
    verificationToken: r.verification_token,
    verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
    spfStatus: r.spf_status,
    dkimStatus: r.dkim_status,
    mxStatus: r.mx_status,
    returnPathStatus: r.return_path_status,
    dkimIdentifierString: r.dkim_identifier_string,
    outgoing: !!r.outgoing,
    incoming: !!r.incoming,
    useForAny: !!r.use_for_any,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

// ── Routes ──────────────────────────────────────────────────────────────────

export interface PostalRoute {
  id: number;
  uuid: string;
  serverId: number;
  domainId: number;
  domainName: string;
  name: string;
  endpointType: string | null; // 'HTTPEndpoint' | 'SMTPEndpoint' | 'AddressEndpoint' | null
  mode: string | null; // 'Endpoint' | 'Accept' | 'Reject' | 'Hold' | 'Bounce'
  spamMode: string | null;
  createdAt: string;
}

export async function listRoutes(serverId: number): Promise<PostalRoute[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT r.id, r.uuid, r.server_id, r.domain_id, d.name AS domain_name,
            r.name, r.endpoint_type, r.mode, r.spam_mode, r.created_at
       FROM routes r
       LEFT JOIN domains d ON d.id = r.domain_id
      WHERE r.server_id = ? ORDER BY r.name`,
    [serverId],
  );
  return rows.map((r) => ({
    id: r.id,
    uuid: r.uuid,
    serverId: r.server_id,
    domainId: r.domain_id,
    domainName: r.domain_name ?? "",
    name: r.name,
    endpointType: r.endpoint_type,
    mode: r.mode,
    spamMode: r.spam_mode,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
