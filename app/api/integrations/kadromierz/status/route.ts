import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { kadromierz, KadromierzError } from "@/lib/kadromierz";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();
    const masterKeyConfigured = !!process.env.KADROMIERZ_MASTER_API_KEY?.trim();

    const userResp = await keycloak.adminRequest(
      `/users/${userId}`,
      serviceToken,
    );
    if (!userResp.ok) {
      return NextResponse.json({
        connected: false,
        masterKeyConfigured,
      });
    }
    const userData = await userResp.json();
    const apiKey: string | undefined =
      userData.attributes?.kadromierz_api_key?.[0];
    const companyId: string | undefined =
      userData.attributes?.kadromierz_company_id?.[0];
    const employeeId: string | undefined =
      userData.attributes?.kadromierz_employee_id?.[0];
    const linkMode: string | undefined =
      userData.attributes?.kadromierz_link_mode?.[0];
    const emailVerified: boolean = userData.emailVerified === true;

    if (!apiKey) {
      return NextResponse.json({
        connected: false,
        masterKeyConfigured,
        emailVerified,
      });
    }

    // Validate — if the key was revoked we should report disconnected.
    try {
      const me = await kadromierz.getCurrentUser(apiKey);
      return NextResponse.json({
        connected: true,
        masterKeyConfigured,
        mode: linkMode ?? "manual",
        emailVerified,
        email: linkMode === "master" ? userData.email ?? null : me.user.email ?? null,
        firstName: me.user.first_name ?? null,
        lastName: me.user.last_name ?? null,
        companyId: companyId ?? me.user.company_id ?? null,
        employeeId: employeeId ?? me.user.id ?? null,
        role: me.user.role ?? null,
      });
    } catch (err) {
      if (err instanceof KadromierzError && (err.status === 401 || err.status === 403)) {
        return NextResponse.json({
          connected: false,
          reason: "invalid_key",
          masterKeyConfigured,
          emailVerified,
        });
      }
      return NextResponse.json({
        connected: true,
        stale: true,
        masterKeyConfigured,
        mode: linkMode ?? "manual",
        companyId: companyId ?? null,
        employeeId: employeeId ?? null,
      });
    }
  } catch (error) {
    console.error("[Kadromierz Status]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
