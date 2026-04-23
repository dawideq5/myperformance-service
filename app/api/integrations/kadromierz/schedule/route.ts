import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  kadromierz,
  KadromierzError,
  todayScheduleWindow,
} from "@/lib/kadromierz";

async function loadKadromierzConfig(
  userAccessToken: string,
): Promise<{ apiKey: string; employeeId?: string } | null> {
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
  const employeeId: string | undefined =
    userData.attributes?.kadromierz_employee_id?.[0];
  if (!apiKey) return null;
  return { apiKey, employeeId };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await loadKadromierzConfig(session.accessToken);
    if (!config) {
      return NextResponse.json(
        { error: "Kadromierz nie jest połączony" },
        { status: 409 },
      );
    }

    const url = new URL(request.url);
    const defaultWindow = todayScheduleWindow();
    const from = url.searchParams.get("from") || defaultWindow.from;
    const to = url.searchParams.get("to") || defaultWindow.to;

    try {
      const { shifts } = await kadromierz.getSchedule({
        apiKey: config.apiKey,
        from,
        to,
        employeeId: config.employeeId,
      });
      return NextResponse.json({ shifts });
    } catch (err) {
      if (err instanceof KadromierzError) {
        if (err.status === 401 || err.status === 403) {
          return NextResponse.json(
            { error: "Klucz Kadromierz wygasł. Połącz ponownie.", needsReconnect: true },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { error: `Kadromierz odpowiedział ${err.status}` },
          { status: 502 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("[Kadromierz Schedule]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
