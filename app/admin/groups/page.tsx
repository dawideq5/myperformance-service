import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { redirect } from "next/navigation";
import { canAccessAdminPanel } from "@/lib/admin-auth";
import { GroupsClient } from "./GroupsClient";

export const metadata = { title: "Grupy — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminGroupsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!canAccessAdminPanel(session)) redirect("/forbidden");

  return (
    <GroupsClient
      userLabel={session.user.name ?? session.user.email ?? ""}
      userEmail={session.user.email ?? undefined}
    />
  );
}
