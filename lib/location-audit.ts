import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "location-audit" });

/**
 * Audit log dla działań na punktach. Każde wejście usera do panelu z
 * konkretnym punktem + każda istotna akcja (zmiana danych, przypisanie
 * cert, zmiana godzin) ląduje tutaj.
 *
 * Schema:
 *   - id BIGSERIAL
 *   - location_id UUID (z Directus mp_locations)
 *   - user_id (KC sub) — NULL dla system actions
 *   - user_email (denormalizujemy żeby uniknąć JOIN do KC)
 *   - action_type — np. "panel.entered", "details.updated", "cert.assigned"
 *   - payload JSONB — dodatkowe dane akcji
 *   - src_ip
 *   - ts TIMESTAMPTZ
 */

export type LocationActionType =
  | "panel.entered"
  | "panel.location.selected"
  | "panel.exited"
  | "details.updated"
  | "details.created"
  | "details.deleted"
  | "cert.assigned"
  | "cert.unassigned"
  | "photos.updated"
  | "hours.updated"
  | "budget.updated";

export interface LocationAuditEntry {
  id: number;
  locationId: string;
  userId: string | null;
  userEmail: string | null;
  actionType: LocationActionType | string;
  payload: Record<string, unknown> | null;
  srcIp: string | null;
  ts: string;
}

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_location_audit (
        id           BIGSERIAL PRIMARY KEY,
        location_id  UUID NOT NULL,
        user_id      TEXT,
        user_email   TEXT,
        action_type  TEXT NOT NULL,
        payload      JSONB,
        src_ip       TEXT,
        ts           TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS mp_location_audit_loc_ts_idx
        ON mp_location_audit (location_id, ts DESC);
      CREATE INDEX IF NOT EXISTS mp_location_audit_user_idx
        ON mp_location_audit (user_id, ts DESC);
      CREATE INDEX IF NOT EXISTS mp_location_audit_action_idx
        ON mp_location_audit (action_type, ts DESC);
    `);
  });
  schemaReady = true;
}

export async function logLocationAction(args: {
  locationId: string;
  userId?: string | null;
  userEmail?: string | null;
  actionType: LocationActionType | string;
  payload?: Record<string, unknown> | null;
  srcIp?: string | null;
}): Promise<void> {
  await ensureSchema();
  try {
    await withClient(async (c) => {
      await c.query(
        `INSERT INTO mp_location_audit (location_id, user_id, user_email, action_type, payload, src_ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          args.locationId,
          args.userId ?? null,
          args.userEmail ?? null,
          args.actionType,
          args.payload ? JSON.stringify(args.payload) : null,
          args.srcIp ?? null,
        ],
      );
    });
  } catch (err) {
    logger.warn("logLocationAction failed", {
      err: String(err),
      locationId: args.locationId,
      actionType: args.actionType,
    });
  }
}

export interface AuditQuery {
  locationId?: string;
  userId?: string;
  actionType?: string;
  /** ISO timestamp — events od tej daty. */
  since?: string;
  limit?: number;
}

export async function listLocationAudit(
  q: AuditQuery,
): Promise<LocationAuditEntry[]> {
  await ensureSchema();
  const limit = Math.min(q.limit ?? 100, 500);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q.locationId) {
    params.push(q.locationId);
    conditions.push(`location_id = $${params.length}`);
  }
  if (q.userId) {
    params.push(q.userId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (q.actionType) {
    params.push(q.actionType);
    conditions.push(`action_type = $${params.length}`);
  }
  if (q.since) {
    params.push(q.since);
    conditions.push(`ts >= $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);
  return withClient(async (c) => {
    const r = await c.query<{
      id: string;
      location_id: string;
      user_id: string | null;
      user_email: string | null;
      action_type: string;
      payload: Record<string, unknown> | null;
      src_ip: string | null;
      ts: Date;
    }>(
      `SELECT id::text, location_id::text, user_id, user_email, action_type,
              payload, src_ip, ts
         FROM mp_location_audit
         ${where}
         ORDER BY ts DESC
         LIMIT $${params.length}`,
      params,
    );
    return r.rows.map((row) => ({
      id: Number(row.id),
      locationId: row.location_id,
      userId: row.user_id,
      userEmail: row.user_email,
      actionType: row.action_type,
      payload: row.payload,
      srcIp: row.src_ip,
      ts: row.ts.toISOString(),
    }));
  });
}
