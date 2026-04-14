import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session: any = await getServerSession(authOptions);
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const keycloakUrl = process.env.KEYCLOAK_URL;
    const url = `${keycloakUrl}/realms/MyPerformance/account/sessions/${id}`;
    console.log("[API /sessions DELETE]", url);
    
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    });

    console.log("[API /sessions DELETE] keycloak response:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[API /sessions DELETE] error:", errorText);
      return NextResponse.json(
        { error: "Failed to logout session" },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /sessions DELETE] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
