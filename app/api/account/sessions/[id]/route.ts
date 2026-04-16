import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";

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
    const response = await fetch(keycloak.getAccountUrl(`/account/sessions/${id}`), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
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
