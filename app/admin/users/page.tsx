import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessKeycloakAdmin } from "@/lib/admin-auth";
import { keycloak } from "@/lib/keycloak";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }

  if (!canAccessKeycloakAdmin(session)) {
    redirect("/forbidden");
  }

  redirect(keycloak.getAdminConsoleUrl());
}
