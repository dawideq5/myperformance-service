import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";

export async function getSession() {
  const session = await getServerSession(authOptions);
  return session;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return (session as any)?.accessToken || null;
}

export async function keycloakFetch(path: string, options: RequestInit = {}) {
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    return null;
  }

  const keycloakUrl = process.env.KEYCLOAK_URL;
  const url = `${keycloakUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...options.headers,
    },
  });

  return response;
}
