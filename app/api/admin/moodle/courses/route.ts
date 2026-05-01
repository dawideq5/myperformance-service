export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { ExternalServiceUnavailableError, withExternalMysql } from "@/lib/db";
import {
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const courses = await withExternalMysql("MOODLE_DB_URL", async (p) => {
      const [rows] = await p.execute(
        `SELECT id, shortname, fullname, visible FROM mdl_course WHERE id > 1 ORDER BY fullname`,
      );
      return rows;
    });
    return createSuccessResponse({ courses });
  } catch (error) {
    if (error instanceof ExternalServiceUnavailableError) {
      return createSuccessResponse({ courses: [], degraded: true });
    }
    return handleApiError(error);
  }
}
