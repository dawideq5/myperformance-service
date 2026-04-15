import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { getAccountUrl } from "@/lib/keycloak-config";

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await fetch(getAccountUrl("/account/sessions/devices"), {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch sessions", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Flatten device sessions into a simple list
    const flatSessions: any[] = [];
    if (Array.isArray(data)) {
      for (const device of data) {
        if (device.sessions && Array.isArray(device.sessions)) {
          for (const s of device.sessions) {
            flatSessions.push({
              id: s.id,
              ipAddress: s.ipAddress || "Unknown",
              started: s.started || 0,
              lastAccess: s.lastAccess || 0,
              expires: s.expires || 0,
              browser: `${s.browser || "Unknown"} / ${device.os || "Unknown"}`,
              current: s.current || false,
            });
          }
        }
      }
    }
    
    return NextResponse.json(flatSessions);
  } catch (error) {
    console.error("[API /sessions GET] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
