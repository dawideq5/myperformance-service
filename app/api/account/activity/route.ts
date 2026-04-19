import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface KeycloakEvent {
  time: number;
  type: string;
  realmId?: string;
  clientId?: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  error?: string;
  details?: Record<string, string>;
}

export interface ActivityEntry {
  time: number;
  type: string;
  ip?: string;
  clientId?: string;
  error?: string;
  details?: Record<string, string>;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    const dateFrom = formatDate(new Date(Date.now() - SEVEN_DAYS_MS));

    const params = new URLSearchParams({
      user: userId,
      dateFrom,
      first: "0",
      max: "200",
    });

    const response = await keycloak.adminRequest(
      `/events?${params.toString()}`,
      serviceToken,
    );

    if (!response.ok) {
      return NextResponse.json({ entries: [] as ActivityEntry[] });
    }

    const events: KeycloakEvent[] = await response.json();
    const entries: ActivityEntry[] = events
      .sort((a, b) => b.time - a.time)
      .map((e) => ({
        time: e.time,
        type: e.type,
        ip: e.ipAddress,
        clientId: e.clientId,
        error: e.error,
        details: e.details,
      }));

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("[API /activity GET] error:", error);
    return NextResponse.json({ entries: [] as ActivityEntry[] });
  }
}
