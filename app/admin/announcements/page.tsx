import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessConfigHub } from "@/lib/admin-auth";
import { listAnnouncements } from "@/lib/announcements";
import { AnnouncementsAdminClient } from "./AnnouncementsAdminClient";

export const metadata = { title: "Komunikaty — Admin" };
export const dynamic = "force-dynamic";

export default async function AnnouncementsAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canAccessConfigHub(session)) redirect("/forbidden");

  const items = await listAnnouncements();

  return (
    <AnnouncementsAdminClient
      initialItems={items}
      userLabel={session.user?.name ?? session.user?.email ?? undefined}
      userEmail={session.user?.email ?? undefined}
    />
  );
}
