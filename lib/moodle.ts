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

/**
 * High-level wrapper used przez fan-out z dashboardowego endpointu
 * /api/calendar/events POST. Tłumaczy ISO date → unix sec, znajduje
 * Moodle userid po emailu z Keycloak. Zwraca id stworzonego eventu
 * lub null gdy user nie ma Moodle accountu / Moodle niedostępny —
 * caller decyduje czy to traktować jako błąd.
 */
export async function syncEventToMoodleCalendar(args: {
  userId: string; // Keycloak user id
  serviceToken: string;
  title: string;
  description?: string;
  startDate: string; // ISO
  endDate: string;   // ISO
  allDay: boolean;
}): Promise<number | null> {
  if (!isMoodleConfigured()) return null;
  // Pobierz email z KC user (1 admin call).
  const { keycloak } = await import("@/lib/keycloak");
  const userResp = await keycloak.adminRequest(
    `/users/${args.userId}`,
    args.serviceToken,
  );
  if (!userResp.ok) return null;
  const userData = (await userResp.json()) as { email?: string };
  const email = userData.email;
  if (!email) return null;

  const moodleUser = await getUserByEmail(email);
  if (!moodleUser) return null; // user nigdy nie zalogowany do Moodle

  const startSec = Math.floor(new Date(args.startDate).getTime() / 1000);
  const endSec = Math.floor(new Date(args.endDate).getTime() / 1000);
  const duration = Math.max(0, endSec - startSec);

  const ev = await createUserEvent({
    userId: moodleUser.id,
    name: args.title.slice(0, 200),
    description: args.description?.slice(0, 1000),
    timestart: startSec,
    timeduration: args.allDay ? 86400 : duration,
  });
  return ev.id;
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

// ---------------------------------------------------------------------------
// Onboarding course — programmatic create / lookup / enrol
// ---------------------------------------------------------------------------

const ONBOARDING_SHORTNAME = "mp_onboarding";

/**
 * Znajdź kurs onboardingowy po shortname (`mp_onboarding`). Null jeśli
 * nigdy nie utworzony.
 */
export async function findOnboardingCourse(): Promise<MoodleCourseBrief | null> {
  try {
    const data = await moodleCall<{ courses: MoodleCourseBrief[] }>(
      "core_course_get_courses_by_field",
      { field: "shortname", value: ONBOARDING_SHORTNAME },
    );
    return data.courses?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Tworzy kurs onboardingowy w Moodle jeśli nie istnieje, w category=1
 * (Miscellaneous). Zwraca id kursu.
 */
export async function ensureOnboardingCourse(): Promise<number> {
  const existing = await findOnboardingCourse();
  if (existing) return existing.id;
  const data = await moodleCall<Array<{ id: number }>>(
    "core_course_create_courses",
    {
      "courses[0][fullname]": "Onboarding MyPerformance",
      "courses[0][shortname]": ONBOARDING_SHORTNAME,
      "courses[0][categoryid]": 1,
      "courses[0][summary]":
        "Krótki kurs wprowadzający — pulpit, integracje, bezpieczeństwo, powiadomienia. Po ukończeniu intro.js tour automatycznie odznaczamy moduły jako ukończone.",
      "courses[0][summaryformat]": 1,
      "courses[0][format]": "topics",
      "courses[0][visible]": 1,
      "courses[0][numsections]": 4,
    },
  );
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Moodle: course creation returned empty response");
  }
  return data[0].id;
}

/**
 * Self-enroluj usera (po email) jako student w onboarding course.
 * Idempotent — Moodle zwraca błąd jeśli już zapisany, ignorujemy.
 */
export async function enrolUserInOnboarding(email: string): Promise<{
  courseId: number;
  enrolled: boolean;
}> {
  const courseId = await ensureOnboardingCourse();
  const moodleUser = await getUserByEmail(email);
  if (!moodleUser) {
    return { courseId, enrolled: false };
  }
  try {
    await moodleCall("enrol_manual_enrol_users", {
      "enrolments[0][roleid]": 5, // student role (default Moodle)
      "enrolments[0][userid]": moodleUser.id,
      "enrolments[0][courseid]": courseId,
    });
    return { courseId, enrolled: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already enrolled") || msg.includes("wsenrolusers")) {
      return { courseId, enrolled: true };
    }
    throw err;
  }
}

/**
 * Mark Moodle course completed dla usera. Wywoływane po zakończeniu
 * intro.js trasy — robi self-completion przez `core_completion_mark_course_self_completed`.
 *
 * Kurs musi mieć enabled `completion` settings — nasz onboarding course
 * po `ensureOnboardingCourse()` przyjmuje default settings i wymaga ręcznej
 * konfiguracji w Moodle UI (lub przez `core_course_update_courses` z enablecompletion=1).
 * Funkcja best-effort: failure nie blokuje user-flow.
 */
export async function markOnboardingCompleted(email: string): Promise<boolean> {
  const moodleUser = await getUserByEmail(email);
  if (!moodleUser) return false;
  const course = await findOnboardingCourse();
  if (!course) return false;
  try {
    await moodleCall("core_completion_mark_course_self_completed", {
      courseid: course.id,
    });
    return true;
  } catch {
    return false;
  }
}
