import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

export async function POST() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    await keycloak.updateUserAttributes(serviceToken, userId, {
      kadromierz_api_key: [],
      kadromierz_company_id: [],
      kadromierz_employee_id: [],
      kadromierz_connected_at: [],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Kadromierz Disconnect]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
