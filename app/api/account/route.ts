import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import {
  getServiceAccountToken,
  getUserIdFromToken,
  normalizeRequiredActions,
} from "@/lib/keycloak-admin";
import { getAccountUrl, getAdminUrl } from "@/lib/keycloak-config";

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await fetch(getAccountUrl("/account"), {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch profile", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    try {
      const userId = await getUserIdFromToken(session.accessToken);
      const serviceToken = await getServiceAccountToken();
      const adminResponse = await fetch(getAdminUrl(`/users/${userId}`), {
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          Accept: "application/json",
        },
      });

      if (adminResponse.ok) {
        const adminData = await adminResponse.json();
        const normalizedRequiredActions = normalizeRequiredActions(
          adminData.requiredActions || []
        );
        console.log(
          "[API /account GET] adminData.requiredActions:",
          adminData.requiredActions
        );
        console.log(
          "[API /account GET] normalized requiredActions:",
          normalizedRequiredActions
        );
        data.requiredActions = normalizedRequiredActions;
      } else {
        const adminErrorText = await adminResponse.text();
        console.error("[API /account GET] admin fetch error:", adminErrorText);
        data.requiredActions = [];
      }
      console.log("[API /account GET] final merged requiredActions:", data.requiredActions);
    } catch (adminError) {
      console.error("[API /account GET] admin merge error:", adminError);
      data.requiredActions = [];
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API /account GET] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // First get current profile to merge
    const currentRes = await fetch(getAccountUrl("/account"), {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!currentRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch current profile" },
        { status: currentRes.status }
      );
    }

    const currentProfile = await currentRes.json();

    // Merge attributes properly
    const updatedProfile = {
      ...currentProfile,
      ...body,
      attributes: {
        ...(currentProfile.attributes || {}),
        ...(body.attributes || {}),
      },
    };

    const response = await fetch(getAccountUrl("/account"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(updatedProfile),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to update profile", details: errorText },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /account PUT] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
