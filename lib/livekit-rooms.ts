/**
 * LiveKit session lifecycle store — Wave 22 / F16e.
 *
 * Tracks per-room state in our own DB (`mp_livekit_sessions`) so we can:
 *   - enforce "max 1 active room per user" (abuse prevention),
 *   - compute call duration when LiveKit fires `room_finished`,
 *   - resolve `room_name` → `service_id` in the webhook handler without
 *     parsing the room-name format (which is encoded but not contractual).
 *
 * Status machine:
 *   waiting  — room created, no publisher yet (mobile hasn't scanned QR)
 *   active   — at least one participant has joined (LiveKit `participant_joined`)
 *   ended    — room closed (LiveKit `room_finished` or manual end)
 *
 * Concurrency: a partial unique index (status IN waiting/active) enforces
 * the single-active rule at DB level — `request-view` does a friendly pre-check
 * for the 429 message, but the index is the actual race-safe gate.
 */

import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "livekit-rooms" });

export type LiveKitSessionStatus = "waiting" | "active" | "ended";

export interface LiveKitSession {
  id: string;
  roomName: string;
  serviceId: string;
  requestedByEmail: string;
  status: LiveKitSessionStatus;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
}

interface Row {
  id: string;
  room_name: string;
  service_id: string;
  requested_by_email: string;
  status: LiveKitSessionStatus;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
}

function mapRow(r: Row): LiveKitSession {
  return {
    id: r.id,
    roomName: r.room_name,
    serviceId: r.service_id,
    requestedByEmail: r.requested_by_email,
    status: r.status,
    createdAt: r.created_at,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSec: r.duration_sec,
  };
}

let schemaReady = false;

/**
 * Idempotent bootstrap. Called by every public function so the table
 * exists on first query (matches the project's lazy-bootstrap convention).
 *
 * The partial unique index is the load-bearing constraint: it makes
 * `INSERT INTO mp_livekit_sessions` fail with `23505` when the same email
 * already has a non-ended session — a race-free version of the "max 1 active"
 * rule. The route-handler still does an explicit pre-check for a friendly
 * Polish 429 message before tripping this index.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_livekit_sessions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_name           TEXT UNIQUE NOT NULL,
        service_id          TEXT NOT NULL,
        requested_by_email  TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'waiting',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at          TIMESTAMPTZ,
        ended_at            TIMESTAMPTZ,
        duration_sec        INTEGER
      );
    `);
    await c.query(`
      CREATE INDEX IF NOT EXISTS mp_livekit_sessions_service_idx
        ON mp_livekit_sessions (service_id, created_at DESC);
    `);
    await c.query(`
      CREATE INDEX IF NOT EXISTS mp_livekit_sessions_email_idx
        ON mp_livekit_sessions (requested_by_email, status);
    `);
    // Partial unique index — race-safe enforcement of "max 1 active room per
    // serwisant". Status IN ('waiting','active') = anything that hasn't ended
    // yet still counts towards the cap.
    await c.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mp_livekit_sessions_one_active_per_user
        ON mp_livekit_sessions (requested_by_email)
        WHERE status IN ('waiting', 'active');
    `);
  });
  schemaReady = true;
}

/**
 * Returned by `createSession` when the partial unique index trips. Routes
 * map this to a 429 with a friendly message.
 */
export class LiveKitSessionConflictError extends Error {
  constructor(email: string) {
    super(`User ${email} already has an active LiveKit session`);
    this.name = "LiveKitSessionConflictError";
  }
}

export interface CreateSessionInput {
  roomName: string;
  serviceId: string;
  requestedByEmail: string;
}

/**
 * INSERTs a new session row in `waiting` state. The room itself was already
 * created on the LiveKit server by `createRoom()`; this is purely the
 * lifecycle bookkeeping side.
 *
 * Throws `LiveKitSessionConflictError` if the partial unique index is hit
 * (the user already has a non-ended session). Caller should map to 429.
 */
export async function createSession(
  input: CreateSessionInput,
): Promise<LiveKitSession> {
  await ensureSchema();
  try {
    return await withClient(async (c) => {
      const r = await c.query<Row>(
        `INSERT INTO mp_livekit_sessions
            (room_name, service_id, requested_by_email, status)
         VALUES ($1, $2, $3, 'waiting')
         RETURNING id, room_name, service_id, requested_by_email, status,
                   created_at::text, started_at::text, ended_at::text, duration_sec`,
        [input.roomName, input.serviceId, input.requestedByEmail],
      );
      const row = r.rows[0];
      if (!row) {
        throw new Error("INSERT mp_livekit_sessions returned no row");
      }
      return mapRow(row);
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      // Either the room_name UNIQUE clashed (extremely unlikely — random
      // suffix) or the partial unique index for "1 active per user" tripped.
      // We surface the user-scoped conflict because it's the actionable case;
      // the room-name dup would be a programmer error worth surfacing too.
      throw new LiveKitSessionConflictError(input.requestedByEmail);
    }
    throw err;
  }
}

/**
 * Marks a session `active` + stamps `started_at` when LiveKit fires
 * `participant_joined`. Idempotent — if already active or ended, no-op.
 * Returns the (possibly unchanged) row, or null when room_name is unknown
 * (webhook for a room we never created — e.g. another client on the same
 * LiveKit deployment).
 */
export async function markSessionActive(
  roomName: string,
): Promise<LiveKitSession | null> {
  await ensureSchema();
  return withClient(async (c) => {
    // Only flip if currently waiting — avoids overwriting started_at on
    // subsequent participant_joined events (multi-publisher rooms).
    const r = await c.query<Row>(
      `UPDATE mp_livekit_sessions
          SET status     = 'active',
              started_at = now()
        WHERE room_name = $1
          AND status    = 'waiting'
        RETURNING id, room_name, service_id, requested_by_email, status,
                  created_at::text, started_at::text, ended_at::text, duration_sec`,
      [roomName],
    );
    if (r.rows.length > 0) {
      return mapRow(r.rows[0]);
    }
    // No-op path — fetch the existing row so callers can still log details.
    const cur = await c.query<Row>(
      `SELECT id, room_name, service_id, requested_by_email, status,
              created_at::text, started_at::text, ended_at::text, duration_sec
         FROM mp_livekit_sessions
        WHERE room_name = $1`,
      [roomName],
    );
    return cur.rows[0] ? mapRow(cur.rows[0]) : null;
  });
}

export interface EndSessionResult {
  session: LiveKitSession;
  /** True when this call actually flipped status `* → ended`. False on
   * webhook re-delivery (already ended) — callers gate the audit-log
   * emission on this flag to avoid duplicate `live_view_ended` rows. */
  justEnded: boolean;
}

/**
 * Marks a session `ended` + stamps `ended_at` + computes `duration_sec`
 * from `started_at` (or `created_at` when no participant ever joined —
 * the QR was never scanned and LiveKit auto-closed the empty room).
 *
 * Idempotent: re-delivered webhooks don't re-update an ended session,
 * and `justEnded` is false on the second delivery so the caller can skip
 * a duplicate audit-log entry.
 *
 * Returns null when the webhook references a room we don't own (foreign
 * tenant on a shared LiveKit deployment).
 */
export async function endSession(
  roomName: string,
): Promise<EndSessionResult | null> {
  await ensureSchema();
  return withClient(async (c) => {
    const r = await c.query<Row>(
      `UPDATE mp_livekit_sessions
          SET status       = 'ended',
              ended_at     = now(),
              duration_sec = GREATEST(
                0,
                EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at)))::int
              )
        WHERE room_name = $1
          AND status   != 'ended'
        RETURNING id, room_name, service_id, requested_by_email, status,
                  created_at::text, started_at::text, ended_at::text, duration_sec`,
      [roomName],
    );
    if (r.rows.length > 0) {
      logger.info("livekit session ended", {
        roomName,
        durationSec: r.rows[0].duration_sec,
      });
      return { session: mapRow(r.rows[0]), justEnded: true };
    }
    // Already ended (re-delivery) or unknown room — return current row so
    // the webhook can still log a no-op outcome.
    const cur = await c.query<Row>(
      `SELECT id, room_name, service_id, requested_by_email, status,
              created_at::text, started_at::text, ended_at::text, duration_sec
         FROM mp_livekit_sessions
        WHERE room_name = $1`,
      [roomName],
    );
    if (!cur.rows[0]) return null;
    return { session: mapRow(cur.rows[0]), justEnded: false };
  });
}

/**
 * Returns the currently-non-ended sessions for a user. The route handler
 * uses this for a friendly 429 pre-check before INSERT trips the partial
 * unique index.
 */
export async function listActiveSessionsByUser(
  email: string,
): Promise<LiveKitSession[]> {
  await ensureSchema();
  const r = await withClient((c) =>
    c.query<Row>(
      `SELECT id, room_name, service_id, requested_by_email, status,
              created_at::text, started_at::text, ended_at::text, duration_sec
         FROM mp_livekit_sessions
        WHERE requested_by_email = $1
          AND status IN ('waiting', 'active')
        ORDER BY created_at DESC`,
      [email],
    ),
  );
  return r.rows.map(mapRow);
}

/**
 * Lookup by room name — used by the webhook handler to map an incoming
 * event back to its `service_id` without parsing the room-name format.
 */
export async function getSessionByRoom(
  roomName: string,
): Promise<LiveKitSession | null> {
  await ensureSchema();
  const r = await withClient((c) =>
    c.query<Row>(
      `SELECT id, room_name, service_id, requested_by_email, status,
              created_at::text, started_at::text, ended_at::text, duration_sec
         FROM mp_livekit_sessions
        WHERE room_name = $1`,
      [roomName],
    ),
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}
