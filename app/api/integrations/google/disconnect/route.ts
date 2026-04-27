import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { disconnectGoogleForUser } from "@/lib/integrations/google-disconnect";

/**
 * POST /api/integrations/google/disconnect
 * Manual disconnect — wywoływany z UI przez user-clicked button.
 * Auto-disconnect (token expired) idzie przez `disconnectGoogleForUser`
 * z helpera bezpośrednio (bez HTTP roundtrip).
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const result = await disconnectGoogleForUser({ userId, reason: "manual" });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Google Disconnect] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
