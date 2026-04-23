import { getOptionalEnv } from "@/lib/env";
import mysql from "mysql2/promise";

/**
 * Thin Moodle REST client, used by the dashboard to surface the user's
 * calendar + course enrolments alongside Google Calendar + Kadromierz.
 *
 * We intentionally use an admin-level web-services token stored server-side
 * rather than minting per-user tokens. The token sits behind the dashboard
 * session — a panel user never sees it — and we always filter results by
 * the session user's email so one user can't snoop another's events.
 */

export interface MoodleConfig {
  baseUrl: string;
  token: string;
}

export function getMoodleConfig(): MoodleConfig | null {
  const baseUrl = getOptionalEnv("MOODLE_URL").trim();
  const token = getOptionalEnv("MOODLE_API_TOKEN").trim();
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

export function isMoodleConfigured(): boolean {
  return getMoodleConfig() !== null;
}

async function moodleCall<T>(
  wsfunction: string,
  params: Record<string, string | number | Array<string | number>> = {},
): Promise<T> {
  const cfg = getMoodleConfig();
  if (!cfg) throw new Error("Moodle not configured (MOODLE_URL / MOODLE_API_TOKEN)");

  const body = new URLSearchParams();
  body.set("wstoken", cfg.token);
  body.set("wsfunction", wsfunction);
  body.set("moodlewsrestformat", "json");
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      v.forEach((item, i) => body.set(`${k}[${i}]`, String(item)));
    } else {
      body.set(k, String(v));
    }
  }

  const res = await fetch(`${cfg.baseUrl}/webservice/rest/server.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Moodle ${wsfunction} → HTTP ${res.status}`);
  }
  const data = (await res.json()) as T & { exception?: string; errorcode?: string; message?: string };
  if (
    data &&
    typeof data === "object" &&
    "exception" in data &&
    (data as { exception?: string }).exception
  ) {
    const msg = (data as { message?: string }).message ?? "Moodle error";
    throw new Error(`Moodle ${wsfunction}: ${msg}`);
  }
  return data as T;
}

export interface MoodleUser {
  id: number;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  fullname: string;
}

export async function getUserByEmail(email: string): Promise<MoodleUser | null> {
  const data = await moodleCall<MoodleUser[]>("core_user_get_users_by_field", {
    field: "email",
    "values[0]": email,
  });
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

export interface MoodleCalendarEvent {
  id: number;
  name: string;
  description?: string;
  timestart: number;
  timeduration: number;
  courseid: number;
  eventtype: string;
  url?: string | null;
  location?: string | null;
}

interface CalendarEventsResponse {
  events: MoodleCalendarEvent[];
  warnings?: { message?: string }[];
}

/**
 * Fetch the user's upcoming calendar events (user + course + site events
 * they can see). Time window in Unix seconds — default next 60 days.
 *
 * WS `core_calendar_get_calendar_events` zwraca events w perspektywie
 * tokenu (admin) — user events innego usera są niewidoczne. Gdy
 * `MOODLE_DB_URL` jest ustawione, używamy bezpośredniego zapytania do
 * mdl_event (który wymusza scope per userId + course enrolments + site
 * events). To fallback dla WS visibility limit.
 */
export async function getUserCalendarEvents(
  userId: number,
  opts: { timestart?: number; timeend?: number } = {},
): Promise<MoodleCalendarEvent[]> {
  const now = Math.floor(Date.now() / 1000);
  const timestart = opts.timestart ?? now - 14 * 24 * 3600;
  const timeend = opts.timeend ?? now + 90 * 24 * 3600;

  const dbUrl = getOptionalEnv("MOODLE_DB_URL").trim();
  if (dbUrl) {
    return getUserCalendarEventsFromDb(userId, timestart, timeend, dbUrl);
  }

  const params: Record<string, string | number> = {
    "options[userevents]": 1,
    "options[siteevents]": 1,
    "options[timestart]": timestart,
    "options[timeend]": timeend,
    "options[ignorehidden]": 1,
  };
  const data = await moodleCall<CalendarEventsResponse>(
    "core_calendar_get_calendar_events",
    params,
  );
  return (data.events ?? []).filter((e) => typeof e.timestart === "number");
}

let moodleMysqlPool: mysql.Pool | null = null;
function getMoodleMysqlPool(dbUrl: string): mysql.Pool {
  if (moodleMysqlPool) return moodleMysqlPool;
  moodleMysqlPool = mysql.createPool({
    uri: dbUrl,
    connectionLimit: 3,
    waitForConnections: true,
  });
  return moodleMysqlPool;
}

async function getUserCalendarEventsFromDb(
  userId: number,
  timestart: number,
  timeend: number,
  dbUrl: string,
): Promise<MoodleCalendarEvent[]> {
  const pool = getMoodleMysqlPool(dbUrl);
  // User widzi:
  //   - events gdzie userid = user.id (personal)
  //   - events gdzie eventtype='site' (global)
  //   - events gdzie courseid w jego enrolmentach
  const [rows] = await pool.query(
    `SELECT e.id, e.name, e.description, e.eventtype, e.courseid,
            e.timestart, e.timeduration, e.location
     FROM mdl_event e
     WHERE e.timestart + COALESCE(e.timeduration,0) >= ?
       AND e.timestart <= ?
       AND (
         e.userid = ?
         OR e.eventtype = 'site'
         OR (e.eventtype IN ('course','category','group') AND e.courseid IN (
           SELECT e2.courseid FROM mdl_user_enrolments ue
             JOIN mdl_enrol e2 ON ue.enrolid = e2.id
            WHERE ue.userid = ?
         ))
       )
     ORDER BY e.timestart ASC
     LIMIT 500`,
    [timestart, timeend, userId, userId],
  );
  const list = rows as Array<{
    id: number;
    name: string;
    description?: string | null;
    eventtype: string;
    courseid?: number | null;
    timestart: number;
    timeduration: number | null;
    location?: string | null;
  }>;
  return list.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    timestart: Number(r.timestart),
    timeduration: Number(r.timeduration ?? 0),
    courseid: Number(r.courseid ?? 0),
    eventtype: r.eventtype,
    location: r.location ?? null,
    url: r.courseid
      ? `${(getMoodleConfig()?.baseUrl ?? "").replace(/\/$/, "")}/calendar/view.php?view=day&course=${r.courseid}&time=${r.timestart}`
      : null,
  }));
}

export interface MoodleCourseBrief {
  id: number;
  fullname: string;
  shortname: string;
  visible: boolean;
  enddate?: number;
  progress?: number;
}

export async function getUserCourses(): Promise<MoodleCourseBrief[]> {
  try {
    const data = await moodleCall<{ courses: MoodleCourseBrief[] }>(
      "core_course_get_enrolled_courses_by_timeline_classification",
      { classification: "inprogress" },
    );
    return data.courses ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// User-event CRUD via WS
// Moodle splits calendar events into types: user/site/course/category/group.
// We only let the panel create/update/delete `user` events — higher-scope
// events remain managed inside Moodle itself.
// ---------------------------------------------------------------------------

interface CreateEventPayload {
  name: string;
  description?: string;
  timestart: number;
  timeduration: number;
  location?: string;
  userId: number;
}

interface UpdateEventPayload {
  name: string;
  description?: string;
  timestart: number;
  timeduration: number;
  location?: string;
}

/**
 * Direct INSERT into mdl_event — core_calendar_create_calendar_events
 * rejects the `userid` field ("Unexpected keys (userid) detected in
 * parameter array"), meaning events created through the admin WS token
 * always land on the admin account. We bypass that by writing straight to
 * the DB, which lets us preserve per-user ownership.
 */
export async function createUserEvent(
  payload: CreateEventPayload,
): Promise<MoodleCalendarEvent> {
  const dbUrl = getOptionalEnv("MOODLE_DB_URL").trim();
  if (!dbUrl) throw new Error("MOODLE_DB_URL required for createUserEvent");
  const pool = getMoodleMysqlPool(dbUrl);
  const now = Math.floor(Date.now() / 1000);
  const location = payload.location ?? "";

  const [res] = await pool.execute(
    `INSERT INTO mdl_event
        (name, description, format, categoryid, courseid, groupid, userid,
         repeatid, modulename, instance, type, eventtype,
         timestart, timeduration, timesort, visible, uuid, sequence,
         timemodified, location)
     VALUES (?, ?, 1, 0, 0, 0, ?,
             0, '', 0, 0, 'user',
             ?, ?, ?, 1, '', 1,
             ?, ?)`,
    [
      payload.name,
      payload.description ?? "",
      payload.userId,
      payload.timestart,
      payload.timeduration,
      payload.timestart,
      now,
      location,
    ],
  );
  const insertId = (res as { insertId: number }).insertId;
  return {
    id: insertId,
    name: payload.name,
    description: payload.description ?? undefined,
    timestart: payload.timestart,
    timeduration: payload.timeduration,
    courseid: 0,
    eventtype: "user",
    location: location || null,
    url: null,
  };
}

/**
 * Moodle core WS lacks a first-class "update event" function — we implement
 * update as delete+recreate to stay on the supported surface. Caller
 * supplies the owning userId (resolved upstream from the session email)
 * so we do not need a separate fetch of the existing event, and avoid
 * WS permission checks that disallow `get_calendar_events` with `eventids`
 * against events owned by someone other than the token user.
 */
export async function updateUserEvent(
  id: number,
  payload: UpdateEventPayload & { userId: number },
): Promise<MoodleCalendarEvent> {
  if (!getMoodleConfig()) throw new Error("Moodle not configured");
  await deleteUserEvent(id);
  return createUserEvent({
    name: payload.name,
    description: payload.description,
    timestart: payload.timestart,
    timeduration: payload.timeduration,
    location: payload.location,
    userId: payload.userId,
  });
}

/**
 * Delete via DB — matches the direct-insert approach in createUserEvent so
 * the WS token's admin context doesn't leak into ownership decisions.
 * Only `eventtype='user'` rows are touched; course/site/group events stay
 * safe from accidental wipes.
 */
export async function deleteUserEvent(id: number): Promise<void> {
  const dbUrl = getOptionalEnv("MOODLE_DB_URL").trim();
  if (!dbUrl) throw new Error("MOODLE_DB_URL required for deleteUserEvent");
  const pool = getMoodleMysqlPool(dbUrl);
  await pool.execute(
    `DELETE FROM mdl_event WHERE id=? AND eventtype='user'`,
    [id],
  );
}
