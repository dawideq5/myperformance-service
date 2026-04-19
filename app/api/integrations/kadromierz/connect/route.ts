import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { kadromierz, KadromierzError } from "@/lib/kadromierz";

/**
 * POST /api/integrations/kadromierz/connect
 *
 * Two modes:
 *
 *  1. **Auto** (when KADROMIERZ_MASTER_API_KEY is set, default):
 *     Uses the company-owner's master token to look up the employee by the
 *     user's *verified* Keycloak email. No per-user token needed, no input.
 *     The user must have emailVerified=true in Keycloak.
 *
 *  2. **Manual** (fallback when no master key configured):
 *     User pastes their personal Kadromierz API key.
 */
export async function POST(request: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const masterKey = process.env.KADROMIERZ_MASTER_API_KEY?.trim() ?? "";

    const userId = await keycloak.getUserIdFromToken(session.accessToken);
    const serviceToken = await keycloak.getServiceAccountToken();

    if (!rawKey && masterKey) {
      const userRes = await keycloak.adminRequest(
        `/users/${userId}`,
        serviceToken,
      );
      if (!userRes.ok) {
        return NextResponse.json(
          { error: "Nie można odczytać Twoich danych z Keycloak" },
          { status: 502 },
        );
      }
      const userData = await userRes.json();
      const email: string | undefined = userData.email;
      const emailVerified: boolean = userData.emailVerified === true;

      if (!email) {
        return NextResponse.json(
          {
            error:
              "Brak emaila w Twoim profilu. Uzupełnij email w ustawieniach konta.",
          },
          { status: 400 },
        );
      }
      if (!emailVerified) {
        return NextResponse.json(
          {
            error:
              "Zweryfikuj swój adres email zanim połączysz konto Kadromierz. Sprawdź skrzynkę lub poproś admina o wysłanie linku weryfikacyjnego.",
            code: "EMAIL_NOT_VERIFIED",
          },
          { status: 403 },
        );
      }

      let masterMe;
      try {
        masterMe = await kadromierz.getCurrentUser(masterKey);
      } catch (err) {
        if (err instanceof KadromierzError) {
          return NextResponse.json(
            {
              error:
                "Master key Kadromierz jest nieprawidłowy lub wygasł. Skonfiguruj KADROMIERZ_MASTER_API_KEY.",
            },
            { status: 502 },
          );
        }
        throw err;
      }

      const companyId = masterMe.user.company_id;
      if (!companyId) {
        return NextResponse.json(
          {
            error:
              "Master key nie jest powiązany z żadną firmą — sprawdź uprawnienia tokenu.",
          },
          { status: 502 },
        );
      }

      const employee = await kadromierz
        .findEmployeeByEmail(masterKey, companyId, email)
        .catch((err) => {
          if (err instanceof KadromierzError) return null;
          throw err;
        });

      if (!employee) {
        return NextResponse.json(
          {
            error: `Nie znaleziono pracownika z emailem ${email} w Twojej firmie Kadromierz. Poproś administratora firmy o dodanie Cię jako pracownika.`,
            code: "EMPLOYEE_NOT_FOUND",
          },
          { status: 404 },
        );
      }

      await keycloak.updateUserAttributes(serviceToken, userId, {
        kadromierz_api_key: [masterKey],
        kadromierz_company_id: [String(companyId)],
        kadromierz_employee_id: [String(employee.id)],
        kadromierz_connected_at: [new Date().toISOString()],
        kadromierz_link_mode: ["master"],
      });

      return NextResponse.json({
        connected: true,
        mode: "master",
        email: employee.email ?? email,
        firstName: employee.first_name ?? null,
        lastName: employee.last_name ?? null,
        companyId,
        employeeId: employee.id,
      });
    }

    if (!rawKey) {
      return NextResponse.json(
        {
          error: masterKey
            ? "Master key jest skonfigurowany — wystarczy kliknąć Połącz."
            : "Admin nie skonfigurował master key. Wpisz swój osobisty klucz API Kadromierza.",
        },
        { status: 400 },
      );
    }

    let me;
    try {
      me = await kadromierz.verifyKey(rawKey);
    } catch (err) {
      if (err instanceof KadromierzError) {
        if (err.status === 401 || err.status === 403) {
          return NextResponse.json(
            { error: "Klucz API jest nieprawidłowy lub wygasł." },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { error: `Kadromierz odpowiedział ${err.status}: ${err.body || ""}` },
          { status: 502 },
        );
      }
      throw err;
    }

    await keycloak.updateUserAttributes(serviceToken, userId, {
      kadromierz_api_key: [rawKey],
      kadromierz_company_id: me.user.company_id ? [String(me.user.company_id)] : [],
      kadromierz_employee_id: me.user.id ? [String(me.user.id)] : [],
      kadromierz_connected_at: [new Date().toISOString()],
      kadromierz_link_mode: ["manual"],
    });

    return NextResponse.json({
      connected: true,
      mode: "manual",
      email: me.user.email ?? null,
      firstName: me.user.first_name ?? null,
      lastName: me.user.last_name ?? null,
      companyId: me.user.company_id ?? null,
      employeeId: me.user.id ?? null,
    });
  } catch (error) {
    console.error("[Kadromierz Connect]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
