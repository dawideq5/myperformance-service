import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessInfrastructure } from "@/lib/admin-auth";
import { InfrastructureClient } from "./InfrastructureClient";

export const dynamic = "force-dynamic";

export default async function InfrastructurePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }
  if (!canAccessInfrastructure(session)) {
    redirect("/forbidden");
  }
  return (
    <InfrastructureClient
      userLabel={session.user.name ?? session.user.email ?? ""}
      userEmail={session.user.email ?? undefined}
    />
  );
}
