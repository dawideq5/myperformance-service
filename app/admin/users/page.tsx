import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessAdminPanel } from "@/lib/admin-auth";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }

  if (!canAccessAdminPanel(session)) {
    redirect("/dashboard");
  }

  return (
    <UsersClient
      selfId={session.user.id}
      userLabel={session.user.name ?? session.user.email ?? ""}
      userEmail={session.user.email ?? undefined}
    />
  );
}
