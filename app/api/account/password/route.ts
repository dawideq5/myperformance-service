import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { getAccountUrl } from "@/lib/keycloak-config";

export async function POST(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);

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

    // Use Keycloak Account API to change password
    const passwordResponse = await fetch(getAccountUrl("/account/credentials/password"), {
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
