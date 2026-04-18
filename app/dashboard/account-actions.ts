"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = "myperformance";

export async function getAccountInfo() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return null;

  try {
    const response = await fetch(`${KEYCLOAK_URL}/realms/${REALM}/account`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    });

    if (!response.ok) throw new Error("Failed to fetch account info");
    return await response.json();
  } catch (error) {
    console.error("Keycloak Account API Error:", error);
    return null;
  }
}

export async function updateAccountInfo(data: { firstName: string; lastName: string; email: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { success: false };

  try {
    const response = await fetch(`${KEYCLOAK_URL}/realms/${REALM}/account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify(data),
    });

    return { success: response.ok };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
