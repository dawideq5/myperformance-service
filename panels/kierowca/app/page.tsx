import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DriverHome } from "@/components/DriverHome";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const hasRole = roles.includes("kierowca") || roles.includes("admin");
  if (!hasRole) redirect("/forbidden");

  const userLabel = session.user?.name ?? session.user?.email ?? "";
  const userEmail = session.user?.email ?? "";

  return <DriverHome userLabel={userLabel} userEmail={userEmail} />;
}
