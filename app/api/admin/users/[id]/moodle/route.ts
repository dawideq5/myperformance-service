export const dynamic = "force-dynamic";

import mysql from "mysql2/promise";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { getOptionalEnv } from "@/lib/env";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ id: string }>;
}

let pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (pool) return pool;
  const url = getOptionalEnv("MOODLE_DB_URL");
  if (!url) throw new ApiError("SERVICE_UNAVAILABLE", "MOODLE_DB_URL not set", 503);
  pool = mysql.createPool({
    uri: url,
    connectionLimit: 3,
    waitForConnections: true,
  });
  return pool;
}

interface CourseRow {
  id: number;
  shortname: string;
  fullname: string;
  visible: number;
}

interface EnrolmentRow {
  courseid: number;
  status: number; // 0 active, 1 suspended
}

/**
 * GET — wszystkie kursy + courseids w które user jest zapisany.
 * Pomija course id=1 (Front page system course).
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id: userId } = await params;

    const token = await keycloak.getServiceAccountToken();
    const userResp = await keycloak.adminRequest(`/users/${userId}`, token);
    if (!userResp.ok) throw ApiError.notFound("User not found");
    const userData = (await userResp.json()) as { email?: string };
    const email = userData.email;
    if (!email) {
      return createSuccessResponse({
        allCourses: [],
        enrolledCourseIds: [],
        moodleUserId: null,
      });
    }

    const p = getPool();
    const [userRows] = await p.execute(
      `SELECT id FROM mdl_user WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [email],
    );
    const moodleUserId = (userRows as Array<{ id: number }>)[0]?.id ?? null;

    const [courseRows] = await p.execute(
      `SELECT id, shortname, fullname, visible FROM mdl_course
        WHERE id > 1 ORDER BY fullname`,
    );

    let enrolledCourseIds: number[] = [];
    if (moodleUserId !== null) {
      const [enrolmentRows] = await p.execute(
        `SELECT e.courseid AS courseid, ue.status AS status
           FROM mdl_user_enrolments ue
           JOIN mdl_enrol e ON e.id = ue.enrolid
          WHERE ue.userid = ? AND ue.status = 0`,
        [moodleUserId],
      );
      enrolledCourseIds = (enrolmentRows as EnrolmentRow[]).map((r) => r.courseid);
    }

    return createSuccessResponse({
      allCourses: courseRows as CourseRow[],
      enrolledCourseIds,
      moodleUserId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  action: "add" | "remove";
  courseId: number;
}

/**
 * POST — enroll/unenroll usera do kursu. Używa istniejącego manual enrol
 * instance (mdl_enrol z enrol='manual' AND courseid=X). Jeśli brak, zwraca
 * 409 — admin musi pierwsza dodać manual enrol method w UI Moodle.
 *
 * Enrol = INSERT do mdl_user_enrolments + INSERT do mdl_role_assignments
 * dla student role (id=5) w course context.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id: userId } = await params;
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.action || !body?.courseId) {
      throw ApiError.badRequest("action + courseId required");
    }

    const token = await keycloak.getServiceAccountToken();
    const userResp = await keycloak.adminRequest(`/users/${userId}`, token);
    if (!userResp.ok) throw ApiError.notFound("User not found");
    const userData = (await userResp.json()) as { email?: string };
    const email = userData.email;
    if (!email) throw ApiError.badRequest("User has no email");

    const p = getPool();
    const [userRows] = await p.execute(
      `SELECT id FROM mdl_user WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [email],
    );
    const moodleUserId = (userRows as Array<{ id: number }>)[0]?.id;
    if (!moodleUserId) {
      throw ApiError.conflict(
        "User nie zalogował się jeszcze do Moodle — niech wykona pierwsze logowanie SSO.",
      );
    }

    // Manual enrol instance.
    const [enrolRows] = await p.execute(
      `SELECT id FROM mdl_enrol WHERE courseid = ? AND enrol = 'manual' LIMIT 1`,
      [body.courseId],
    );
    const enrolId = (enrolRows as Array<{ id: number }>)[0]?.id;
    if (!enrolId) {
      throw ApiError.conflict(
        "Kurs nie ma metody zapisu 'manual'. Dodaj ją w Moodle (Course settings → Enrolment methods).",
      );
    }

    // Course context (contextlevel=50).
    const [ctxRows] = await p.execute(
      `SELECT id FROM mdl_context WHERE contextlevel = 50 AND instanceid = ? LIMIT 1`,
      [body.courseId],
    );
    const contextId = (ctxRows as Array<{ id: number }>)[0]?.id;
    if (!contextId) {
      throw ApiError.conflict("Brak context-row dla kursu.");
    }

    if (body.action === "remove") {
      await p.execute(
        `DELETE FROM mdl_user_enrolments WHERE userid = ? AND enrolid = ?`,
        [moodleUserId, enrolId],
      );
      await p.execute(
        `DELETE FROM mdl_role_assignments WHERE userid = ? AND contextid = ?`,
        [moodleUserId, contextId],
      );
    } else {
      const now = Math.floor(Date.now() / 1000);
      await p.execute(
        `INSERT INTO mdl_user_enrolments
           (status, enrolid, userid, timestart, timeend, modifierid, timecreated, timemodified)
         VALUES (0, ?, ?, ?, 0, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status=0, timemodified=VALUES(timemodified)`,
        [enrolId, moodleUserId, now, moodleUserId, now, now],
      );
      // student role id=5 (canonical w każdej Moodle instalacji).
      await p.execute(
        `INSERT INTO mdl_role_assignments
           (roleid, contextid, userid, timemodified, modifierid, component, itemid, sortorder)
         VALUES (5, ?, ?, ?, ?, '', 0, 0)
         ON DUPLICATE KEY UPDATE timemodified=VALUES(timemodified)`,
        [contextId, moodleUserId, now, moodleUserId],
      );
    }
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
