import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";

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

    const keycloakUrl = process.env.KEYCLOAK_URL;

    // Verify current password by attempting a token exchange
    const verifyResponse = await fetch(
      `${keycloakUrl}/realms/MyPerformance/protocol/openid-connect/token`,
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

    // Use Keycloak Account API to change password
    const passwordUrl = `${keycloakUrl}/realms/MyPerformance/account/credentials/password`;
    console.log("[API /password POST] changing password at:", passwordUrl);

    const passwordResponse = await fetch(passwordUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
        confirmation: newPassword,
      }),
    });

    console.log("[API /password POST] change password response:", passwordResponse.status);

    if (!passwordResponse.ok) {
      const errorData = await passwordResponse.text();
      console.error("[API /password POST] error:", errorData);
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
