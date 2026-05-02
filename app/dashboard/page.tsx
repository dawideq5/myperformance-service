import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { DashboardClient } from "./DashboardClient";
import { AnnouncementsBanner } from "./AnnouncementsBanner";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }

  return (
    <DashboardClient
      userLabel={session.user.name ?? session.user.email ?? undefined}
      email={session.user.email ?? undefined}
      announcementsSlot={<AnnouncementsBanner />}
    />
  );
}
