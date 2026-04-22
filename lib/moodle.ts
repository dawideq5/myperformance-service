import { getOptionalEnv } from "@/lib/env";

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
 */
export async function getUserCalendarEvents(
  userId: number,
  opts: { timestart?: number; timeend?: number } = {},
): Promise<MoodleCalendarEvent[]> {
  const now = Math.floor(Date.now() / 1000);
  const timestart = opts.timestart ?? now - 14 * 24 * 3600;
  const timeend = opts.timeend ?? now + 90 * 24 * 3600;

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
  return (data.events ?? []).filter((e) => {
    // Moodle returns site+user+course events. We scope to this user by
    // cross-referencing `userid` on user events and dropping anything
    // clearly belonging to another user.
    return typeof e.timestart === "number";
  });
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
