import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { getServiceAccountToken, getUserIdFromToken } from "@/lib/keycloak-admin";
import { getAccountUrl, getAdminUrl } from "@/lib/keycloak-config";

export async function POST(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);

    console.log("[API /password POST] session exists:", !!session, "accessToken exists:", !!session?.accessToken);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Brakuje wymaganych pól" },
        { status: 400 }
      );
    }

    // Verify current password by attempting a token exchange
    const verifyResponse = await fetch(
      getAccountUrl("/protocol/openid-connect/token"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "password",
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
          username: session.user?.email || "",
          password: currentPassword,
          scope: "openid",
        }),
      }
    );

    console.log("[API /password POST] verify password response:", verifyResponse.status);

    if (!verifyResponse.ok) {
      return NextResponse.json(
        { error: "Aktualne hasło jest nieprawidłowe" },
        { status: 401 }
      );
    }

    // Use Keycloak Admin REST API to change password
    const userId = await getUserIdFromToken(session.accessToken);
    const serviceToken = await getServiceAccountToken();

    const passwordUrl = getAdminUrl(`/users/${userId}/reset-password`);
    console.log("[API /password POST] changing password at:", passwordUrl);

    const passwordResponse = await fetch(passwordUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "password",
        value: newPassword,
        temporary: false,
      }),
    });

    if (!passwordResponse.ok) {
      const errorData = await passwordResponse.text();
      return NextResponse.json(
        { error: "Nie udało się zmienić hasła", details: errorData },
        { status: passwordResponse.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /password POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
