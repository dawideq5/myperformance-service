/**
 * LiveKit session lifecycle store — Wave 22 / F16e + Wave 23 rework.
 *
 * Tracks per-room state in our own DB (`mp_livekit_sessions`) so we can:
 *   - enforce "max 1 active room per user" (abuse prevention),
 *   - compute call duration when LiveKit fires `room_finished`,
 *   - resolve `room_name` → `service_id` / `chatwoot_conversation_id`
 *     in the webhook handler without parsing the room-name format.
 *
 * Wave 23 zmienia model:
 *   - `service_id` jest NULLABLE (sprzedawca może rozpocząć konsultację
 *     ZANIM zapisze service do bazy — formularz intake co-edited live);
 *   - dochodzi `chatwoot_conversation_id` (do której wstrzykujemy link
 *     join URL żeby Chatwoot agent dołączył jednym kliknięciem).
 *
 * Status machine:
 *   waiting  — room created, no participant yet
 *   active   — at least one participant has joined (`participant_joined`)
 *   ended    — room closed (`room_finished` lub manual end)
 */

import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "livekit-rooms" });

export type LiveKitSessionStatus = "waiting" | "active" | "ended";

export interface LiveKitSession {
  id: string;
  roomName: string;
  /** Powiązany service id. NULL dla konsultacji bez utworzonego ticketu. */
  serviceId: string | null;
  /** Chatwoot conversation id (gdy link konsultacyjny został tam wysłany). */
  chatwootConversationId: number | null;
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
  service_id: string | null;
  chatwoot_conversation_id: number | null;
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
    chatwootConversationId: r.chatwoot_conversation_id,
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
 * Idempotent bootstrap. Wave 23 dodaje:
 *   - ALTER COLUMN service_id DROP NOT NULL (konsultacja bez ticketu),
 *   - ADD COLUMN chatwoot_conversation_id BIGINT (link cel).
 * Każda mutacja jest IF EXISTS / IF NOT EXISTS żeby działała zarówno na
 * świeżych jak i istniejących bazach (Wave 22 już utworzył tabelę).
 */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_livekit_sessions (
        id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_name                TEXT UNIQUE NOT NULL,
        service_id               TEXT,
        chatwoot_conversation_id BIGINT,
        requested_by_email       TEXT NOT NULL,
        status                   TEXT NOT NULL DEFAULT 'waiting',
        created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at               TIMESTAMPTZ,
        ended_at                 TIMESTAMPTZ,
        duration_sec             INTEGER
      );
    `);
    // Wave 22 → Wave 23 migration: service_id was NOT NULL, drop it.
    await c.query(`
      ALTER TABLE mp_livekit_sessions
        ALTER COLUMN service_id DROP NOT NULL;
    `);
    // Wave 23 — add chatwoot_conversation_id when upgrading from Wave 22.
    await c.query(`
      ALTER TABLE mp_livekit_sessions
        ADD COLUMN IF NOT EXISTS chatwoot_conversation_id BIGINT;
    `);
    await c.query(`
      CREATE INDEX IF NOT EXISTS mp_livekit_sessions_service_idx
        ON mp_livekit_sessions (service_id, created_at DESC);
    `);
    await c.query(`
      CREATE INDEX IF NOT EXISTS mp_livekit_sessions_email_idx
        ON mp_livekit_sessions (requested_by_email, status);
    `);
    await c.query(`
      CREATE INDEX IF NOT EXISTS mp_livekit_sessions_status_idx
        ON mp_livekit_sessions (status, created_at DESC);
    `);
    // Partial unique index — race-safe enforcement of "max 1 active room
    // per user". Status IN ('waiting','active') = anything that hasn't
    // ended yet still counts towards the cap.
    await c.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mp_livekit_sessions_one_active_per_user
        ON mp_livekit_sessions (requested_by_email)
        WHERE status IN ('waiting', 'active');
    `);
  });
  schemaReady = true;
}

export class LiveKitSessionConflictError extends Error {
  constructor(email: string) {
    super(`User ${email} already has an active LiveKit session`);
    this.name = "LiveKitSessionConflictError";
  }
}

export interface CreateSessionInput {
  roomName: string;
  /** Optional — Wave 23 supports consultation without a service. */
  serviceId?: string | null;
  /** Optional — set when we wrote a join link to a Chatwoot conversation. */
  chatwootConversationId?: number | null;
  requestedByEmail: string;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<LiveKitSession> {
  await ensureSchema();
  try {
    return await withClient(async (c) => {
      const r = await c.query<Row>(
        `INSERT INTO mp_livekit_sessions
            (room_name, service_id, chatwoot_conversation_id,
             requested_by_email, status)
         VALUES ($1, $2, $3, $4, 'waiting')
         RETURNING id, room_name, service_id, chatwoot_conversation_id,
                   requested_by_email, status,
                   created_at::text, started_at::text, ended_at::text,
                   duration_sec`,
        [
          input.roomName,
          input.serviceId ?? null,
          input.chatwootConversationId ?? null,
          input.requestedByEmail,
        ],
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
      throw new LiveKitSessionConflictError(input.requestedByEmail);
    }
    throw err;
  }
}

export async function markSessionActive(
  roomName: string,
): Promise<LiveKitSession | null> {
  await ensureSchema();
  return withClient(async (c) => {
    const r = await c.query<Row>(
      `UPDATE mp_livekit_sessions
          SET status     = 'active',
              started_at = now()
        WHERE room_name = $1
          AND status    = 'waiting'
        RETURNING id, room_name, service_id, chatwoot_conversation_id,
                  requested_by_email, status,
                  created_at::text, started_at::text, ended_at::text,
                  duration_sec`,
      [roomName],
    );
    if (r.rows.length > 0) {
      return mapRow(r.rows[0]);
    }
    const cur = await c.query<Row>(
      `SELECT id, room_name, service_id, chatwoot_conversation_id,
              requested_by_email, status,
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
  justEnded: boolean;
}

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
        RETURNING id, room_name, service_id, chatwoot_conversation_id,
                  requested_by_email, status,
                  created_at::text, started_at::text, ended_at::text,
                  duration_sec`,
      [roomName],
    );
    if (r.rows.length > 0) {
      logger.info("livekit session ended", {
        roomName,
        durationSec: r.rows[0].duration_sec,
      });
      return { session: mapRow(r.rows[0]), justEnded: true };
    }
    const cur = await c.query<Row>(
      `SELECT id, room_name, service_id, chatwoot_conversation_id,
              requested_by_email, status,
              created_at::text, started_at::text, ended_at::text, duration_sec
         FROM mp_livekit_sessions
        WHERE room_name = $1`,
      [roomName],
    );
    if (!cur.rows[0]) return null;
    return { session: mapRow(cur.rows[0]), justEnded: false };
  });
}

export async function listActiveSessionsByUser(
  email: string,
): Promise<LiveKitSession[]> {
  await ensureSchema();
  const r = await withClient((c) =>
    c.query<Row>(
      `SELECT id, room_name, service_id, chatwoot_conversation_id,
              requested_by_email, status,
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
 * Wave 23 — admin oversight. Lista wszystkich nie zakończonych sesji
 * (waiting + active) niezależnie od ownership. Konsumowane przez
 * `/admin/livekit` panel + `/api/admin/livekit/rooms`.
 */
export async function listActiveSessions(): Promise<LiveKitSession[]> {
  await ensureSchema();
  const r = await withClient((c) =>
    c.query<Row>(
      `SELECT id, room_name, service_id, chatwoot_conversation_id,
              requested_by_email, status,
              created_at::text, started_at::text, ended_at::text, duration_sec
         FROM mp_livekit_sessions
        WHERE status IN ('waiting', 'active')
        ORDER BY created_at DESC`,
    ),
  );
  return r.rows.map(mapRow);
}

export async function getSessionByRoom(
  roomName: string,
): Promise<LiveKitSession | null> {
  await ensureSchema();
  const r = await withClient((c) =>
    c.query<Row>(
      `SELECT id, room_name, service_id, chatwoot_conversation_id,
              requested_by_email, status,
              created_at::text, started_at::text, ended_at::text, duration_sec
         FROM mp_livekit_sessions
        WHERE room_name = $1`,
      [roomName],
    ),
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}
