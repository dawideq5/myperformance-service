import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessSecurity } from "@/lib/admin-auth";
import { SecurityClient } from "./SecurityClient";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }
  if (!canAccessSecurity(session)) {
    redirect("/forbidden");
  }
  return (
    <SecurityClient
      userLabel={session.user.name ?? session.user.email ?? ""}
      userEmail={session.user.email ?? undefined}
    />
  );
}
