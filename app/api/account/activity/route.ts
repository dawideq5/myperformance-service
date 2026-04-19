import { getServerSession } from "next-auth/next";
import { type NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// CODE_TO_TOKEN is Keycloak's internal OAuth code exchange — it fires on
// every normal login right after LOGIN, so surfacing it doubles the noise.
const HIDDEN_EVENT_TYPES = new Set(["CODE_TO_TOKEN"]);

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

export async function GET(request: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    // Fetch a broad window so client-side day filters have data for all 7 chips.
    // Pagination is handled client-side after CODE_TO_TOKEN is filtered out —
    // Keycloak's paging counts hidden events, which would leave pages short.
    const dateFrom = formatDate(new Date(Date.now() - SEVEN_DAYS_MS));

    const params = new URLSearchParams({
      user: userId,
      dateFrom,
      first: "0",
      max: "1000",
    });

    const response = await keycloak.adminRequest(
      `/events?${params.toString()}`,
      serviceToken,
    );

    if (!response.ok) {
      return NextResponse.json({
        entries: [] as ActivityEntry[],
        total: 0,
      });
    }

    const events: KeycloakEvent[] = await response.json();
    const filtered = events.filter((e) => !HIDDEN_EVENT_TYPES.has(e.type));
    const entries: ActivityEntry[] = filtered
      .sort((a, b) => b.time - a.time)
      .map((e) => ({
        time: e.time,
        type: e.type,
        ip: e.ipAddress,
        clientId: e.clientId,
        error: e.error,
        details: e.details,
      }));

    const url = new URL(request.url);
    const dayParam = url.searchParams.get("day");
    let scoped = entries;
    if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
      scoped = entries.filter((e) => formatDate(new Date(e.time)) === dayParam);
    }

    return NextResponse.json({ entries: scoped, total: scoped.length });
  } catch (error) {
    console.error("[API /activity GET] error:", error);
    return NextResponse.json({
      entries: [] as ActivityEntry[],
      total: 0,
    });
  }
}
