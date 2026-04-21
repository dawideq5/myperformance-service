import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const hasRole = roles.includes("sprzedawca") || roles.includes("admin");
  if (!hasRole) redirect("/forbidden");

  return (
    <PanelShell
      title="Panel Sprzedawcy"
      subtitle="panelsprzedawcy.myperformance.pl"
      userLabel={session.user?.name ?? session.user?.email ?? ""}
      roles={roles}
    />
  );
}
