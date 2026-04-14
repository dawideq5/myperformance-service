import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    
    console.log("[API /sessions GET] session exists:", !!session, "accessToken exists:", !!session?.accessToken);
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const url = `${keycloakUrl}/realms/MyPerformance/account/sessions/devices`;
    console.log("[API /sessions GET] fetching:", url);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    });

    console.log("[API /sessions GET] keycloak response:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[API /sessions GET] keycloak error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch sessions", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("[API /sessions GET] raw data:", JSON.stringify(data));
    
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
