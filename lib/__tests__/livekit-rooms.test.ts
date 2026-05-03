import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for `lib/livekit-rooms.ts`. The module talks to Postgres via
 * `withClient` from `@/lib/db`; we mock that with a tiny query-script
 * harness so each test can assert SQL shape + provide canned rows
 * without spinning up a real DB.
 */

interface QueryCall {
  sql: string;
  values?: unknown[];
}

const queryCalls: QueryCall[] = [];
let queryScript: Array<(call: QueryCall) => { rows: unknown[] } | Error> = [];

function pushScript(
  ...steps: Array<(call: QueryCall) => { rows: unknown[] } | Error>
): void {
  queryScript.push(...steps);
}

/**
 * Schema bootstrap (`CREATE TABLE IF NOT EXISTS` + indexes) is gated by a
 * module-level `schemaReady` flag, so it only runs on the first call across
 * the whole test file. We auto-handle DDL queries (return empty rows) and
 * only consume from `queryScript` for non-DDL queries.
 */
function isSchemaQuery(sql: string): boolean {
  return /CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE/i.test(sql);
}

vi.mock("@/lib/db", () => ({
  withClient: async <T,>(fn: (c: unknown) => Promise<T>): Promise<T> => {
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        const call: QueryCall = { sql, values };
        queryCalls.push(call);
        if (isSchemaQuery(sql)) {
          return { rows: [] };
        }
        const next = queryScript.shift();
        if (!next) {
          return { rows: [] };
        }
        const result = next(call);
        if (result instanceof Error) {
          throw result;
        }
        return result;
      },
    };
    return fn(client);
  },
}));

import {
  LiveKitSessionConflictError,
  createSession,
  endSession,
  listActiveSessionsByUser,
  markSessionActive,
} from "@/lib/livekit-rooms";

function clearMocks(): void {
  queryCalls.length = 0;
  queryScript = [];
}

beforeEach(() => {
  clearMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSession", () => {
  it("INSERTs a waiting row and returns the mapped session", async () => {
    pushScript(
      // INSERT
      (call) => {
        expect(call.sql).toMatch(/INSERT INTO mp_livekit_sessions/);
        expect(call.values).toEqual([
          "mp-service-svc1-abc",
          "svc1",
          null,
          "tech@mp.pl",
        ]);
        return {
          rows: [
            {
              id: "11111111-1111-1111-1111-111111111111",
              room_name: "mp-service-svc1-abc",
              service_id: "svc1",
              requested_by_email: "tech@mp.pl",
              status: "waiting",
              created_at: "2026-05-03T10:00:00.000Z",
              started_at: null,
              ended_at: null,
              duration_sec: null,
            },
          ],
        };
      },
    );

    const session = await createSession({
      roomName: "mp-service-svc1-abc",
      serviceId: "svc1",
      requestedByEmail: "tech@mp.pl",
    });

    expect(session.status).toBe("waiting");
    expect(session.roomName).toBe("mp-service-svc1-abc");
    expect(session.requestedByEmail).toBe("tech@mp.pl");
  });

  it("maps Postgres 23505 to LiveKitSessionConflictError", async () => {
    pushScript(
      () => Object.assign(new Error("dup"), { code: "23505" }),
    );

    await expect(
      createSession({
        roomName: "room1",
        serviceId: "svc1",
        requestedByEmail: "tech@mp.pl",
      }),
    ).rejects.toBeInstanceOf(LiveKitSessionConflictError);
  });
});

describe("markSessionActive", () => {
  it("UPDATEs status='active' + started_at when row is waiting", async () => {
    pushScript(
      (call) => {
        expect(call.sql).toMatch(/UPDATE mp_livekit_sessions/);
        expect(call.sql).toMatch(/status\s*=\s*'active'/);
        expect(call.sql).toMatch(/status\s*=\s*'waiting'/);
        return {
          rows: [
            {
              id: "id1",
              room_name: "room1",
              service_id: "svc1",
              requested_by_email: "tech@mp.pl",
              status: "active",
              created_at: "2026-05-03T10:00:00.000Z",
              started_at: "2026-05-03T10:00:05.000Z",
              ended_at: null,
              duration_sec: null,
            },
          ],
        };
      },
    );

    const session = await markSessionActive("room1");
    expect(session?.status).toBe("active");
    expect(session?.startedAt).toBe("2026-05-03T10:00:05.000Z");
  });

  it("returns existing row when no-op (already active)", async () => {
    pushScript(
      // First UPDATE returns 0 rows — the WHERE clause filtered out non-waiting.
      () => ({ rows: [] }),
      // Fallback SELECT returns the existing already-active row.
      () => ({
        rows: [
          {
            id: "id1",
            room_name: "room1",
            service_id: "svc1",
            requested_by_email: "tech@mp.pl",
            status: "active",
            created_at: "2026-05-03T10:00:00.000Z",
            started_at: "2026-05-03T10:00:01.000Z",
            ended_at: null,
            duration_sec: null,
          },
        ],
      }),
    );

    const session = await markSessionActive("room1");
    expect(session?.status).toBe("active");
  });

  it("returns null when room is unknown", async () => {
    pushScript(
      () => ({ rows: [] }),
      () => ({ rows: [] }),
    );
    const session = await markSessionActive("ghost");
    expect(session).toBeNull();
  });
});

describe("endSession", () => {
  it("UPDATEs status='ended' + computes duration_sec; flags justEnded=true", async () => {
    pushScript(
      (call) => {
        expect(call.sql).toMatch(/UPDATE mp_livekit_sessions/);
        expect(call.sql).toMatch(/status\s*=\s*'ended'/);
        expect(call.sql).toMatch(/duration_sec\s*=/);
        // Duration math falls back to created_at when started_at is null
        // (QR never scanned).
        expect(call.sql).toMatch(/COALESCE\(started_at,\s*created_at\)/);
        return {
          rows: [
            {
              id: "id1",
              room_name: "room1",
              service_id: "svc1",
              requested_by_email: "tech@mp.pl",
              status: "ended",
              created_at: "2026-05-03T10:00:00.000Z",
              started_at: "2026-05-03T10:00:05.000Z",
              ended_at: "2026-05-03T10:01:35.000Z",
              duration_sec: 90,
            },
          ],
        };
      },
    );

    const result = await endSession("room1");
    expect(result?.justEnded).toBe(true);
    expect(result?.session.status).toBe("ended");
    expect(result?.session.durationSec).toBe(90);
  });

  it("is idempotent on re-delivery (justEnded=false)", async () => {
    pushScript(
      // UPDATE no-op — `WHERE status != 'ended'` filtered it out.
      () => ({ rows: [] }),
      // Fallback SELECT returns the row that was already ended.
      () => ({
        rows: [
          {
            id: "id1",
            room_name: "room1",
            service_id: "svc1",
            requested_by_email: "tech@mp.pl",
            status: "ended",
            created_at: "2026-05-03T10:00:00.000Z",
            started_at: "2026-05-03T10:00:05.000Z",
            ended_at: "2026-05-03T10:01:35.000Z",
            duration_sec: 90,
          },
        ],
      }),
    );

    const result = await endSession("room1");
    // Webhook handler gates audit-log emission on this flag.
    expect(result?.justEnded).toBe(false);
    expect(result?.session.status).toBe("ended");
  });

  it("returns null when room is unknown", async () => {
    pushScript(
      // UPDATE no-op
      () => ({ rows: [] }),
      // SELECT returns nothing
      () => ({ rows: [] }),
    );
    const result = await endSession("ghost");
    expect(result).toBeNull();
  });
});

describe("listActiveSessionsByUser", () => {
  it("filters by email + status IN (waiting, active)", async () => {
    pushScript(
      (call) => {
        expect(call.sql).toMatch(/requested_by_email\s*=\s*\$1/);
        expect(call.sql).toMatch(/status IN \('waiting', 'active'\)/);
        expect(call.values).toEqual(["tech@mp.pl"]);
        return {
          rows: [
            {
              id: "id1",
              room_name: "room1",
              service_id: "svc1",
              requested_by_email: "tech@mp.pl",
              status: "waiting",
              created_at: "2026-05-03T10:00:00.000Z",
              started_at: null,
              ended_at: null,
              duration_sec: null,
            },
          ],
        };
      },
    );

    const sessions = await listActiveSessionsByUser("tech@mp.pl");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("waiting");
  });

  it("returns [] when user has no active sessions", async () => {
    pushScript(() => ({ rows: [] }));
    const sessions = await listActiveSessionsByUser("nobody@mp.pl");
    expect(sessions).toEqual([]);
  });
});
