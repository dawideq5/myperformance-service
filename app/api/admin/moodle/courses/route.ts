export const dynamic = "force-dynamic";

import mysql from "mysql2/promise";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { getOptionalEnv } from "@/lib/env";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

let pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (pool) return pool;
  const url = getOptionalEnv("MOODLE_DB_URL");
  if (!url) throw new ApiError("SERVICE_UNAVAILABLE", "MOODLE_DB_URL not set", 503);
  pool = mysql.createPool({ uri: url, connectionLimit: 3, waitForConnections: true });
  return pool;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const p = getPool();
    const [rows] = await p.execute(
      `SELECT id, shortname, fullname, visible FROM mdl_course WHERE id > 1 ORDER BY fullname`,
    );
    return createSuccessResponse({ courses: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
