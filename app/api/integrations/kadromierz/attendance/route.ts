import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { kadromierz, KadromierzError } from "@/lib/kadromierz";

async function loadConfig(
  userAccessToken: string,
): Promise<{ apiKey: string; companyId?: string } | null> {
  const userId = await keycloak.getUserIdFromToken(userAccessToken);
  const serviceToken = await keycloak.getServiceAccountToken();
  const userResp = await keycloak.adminRequest(
    `/users/${userId}`,
    serviceToken,
  );
  if (!userResp.ok) return null;
  const userData = await userResp.json();
  const apiKey: string | undefined =
    userData.attributes?.kadromierz_api_key?.[0];
  const companyId: string | undefined =
    userData.attributes?.kadromierz_company_id?.[0];
  if (!apiKey) return null;
  return { apiKey, companyId };
}

/**
 * GET /api/integrations/kadromierz/attendance
 * Returns the current open attendance (if any) so the UI can render correct
 * start/break/end button state.
 */
export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await loadConfig(session.accessToken);
    if (!config) {
      return NextResponse.json(
        { error: "Kadromierz nie jest połączony" },
        { status: 409 },
      );
    }
    if (!config.companyId) {
      return NextResponse.json({ attendance: null });
    }

    try {
      const attendance = await kadromierz.getOpenAttendance(
        config.apiKey,
        config.companyId,
      );
      return NextResponse.json({ attendance });
    } catch (err) {
      if (err instanceof KadromierzError && (err.status === 401 || err.status === 403)) {
        return NextResponse.json(
          { error: "Klucz wygasł", needsReconnect: true },
          { status: 409 },
        );
      }
      return NextResponse.json({ attendance: null });
    }
  } catch (error) {
    console.error("[Kadromierz Attendance GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/integrations/kadromierz/attendance
 * Body: { action: "start" | "end" | "break_start" | "break_end", attendanceId?, breakId? }
 */
export async function POST(request: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action as string | undefined;
    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 },
      );
    }

    const config = await loadConfig(session.accessToken);
    if (!config) {
      return NextResponse.json(
        { error: "Kadromierz nie jest połączony" },
        { status: 409 },
      );
    }

    try {
      let attendance;
      if (action === "start") {
        attendance = await kadromierz.clockIn(config.apiKey);
      } else if (action === "end") {
        if (!body.attendanceId) {
          return NextResponse.json(
            { error: "attendanceId is required" },
            { status: 400 },
          );
        }
        attendance = await kadromierz.clockOut(
          config.apiKey,
          body.attendanceId,
        );
      } else if (action === "break_start") {
        if (!body.attendanceId) {
          return NextResponse.json(
            { error: "attendanceId is required" },
            { status: 400 },
          );
        }
        attendance = await kadromierz.startBreak(
          config.apiKey,
          body.attendanceId,
        );
      } else if (action === "break_end") {
        if (!body.attendanceId || !body.breakId) {
          return NextResponse.json(
            { error: "attendanceId and breakId are required" },
            { status: 400 },
          );
        }
        attendance = await kadromierz.endBreak(
          config.apiKey,
          body.attendanceId,
          body.breakId,
        );
      } else {
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
      }
      return NextResponse.json({ attendance });
    } catch (err) {
      if (err instanceof KadromierzError) {
        if (err.status === 401 || err.status === 403) {
          return NextResponse.json(
            { error: "Klucz wygasł. Połącz ponownie.", needsReconnect: true },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { error: `Kadromierz: ${err.status} ${err.body || ""}` },
          { status: 502 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("[Kadromierz Attendance POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
