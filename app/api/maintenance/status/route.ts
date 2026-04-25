export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isMaintenanceActive, getMaintenance } from "@/lib/email/db";

/**
 * Publiczny endpoint statusu konserwacji — używany przez middleware
 * dashboardu (cache 30s), zewnętrzne monitoring tools, status page.
 *
 * Zwraca tylko enabled + message + expiresAt — nie ujawnia kto włączył.
 */
export async function GET() {
  try {
    const active = await isMaintenanceActive();
    if (!active) {
      return NextResponse.json({ enabled: false });
    }
    const state = await getMaintenance();
    return NextResponse.json({
      enabled: true,
      message: state.message,
      expiresAt: state.expiresAt,
    });
  } catch {
    // Fail-open: gdy DB down, NIE blokujemy ruchu (wolimy false-negative
    // niż outage).
    return NextResponse.json({ enabled: false });
  }
}
