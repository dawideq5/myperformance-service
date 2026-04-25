import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessAdminPanel } from "@/lib/admin-auth";
import { EmailClient } from "./EmailClient";

export const dynamic = "force-dynamic";

export default async function AdminEmailPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }

  if (!canAccessAdminPanel(session)) {
    redirect("/forbidden");
  }

  return (
    <EmailClient
      userLabel={session.user.name ?? session.user.email ?? ""}
      userEmail={session.user.email ?? undefined}
    />
  );
}
