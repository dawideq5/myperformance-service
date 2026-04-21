import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessCalendar } from "@/lib/admin-auth";
import { CalendarPageClient } from "./CalendarPageClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }

  if (!canAccessCalendar(session)) {
    redirect("/forbidden");
  }

  return (
    <CalendarPageClient
      userLabel={session.user.name ?? session.user.email ?? undefined}
      userEmail={session.user.email ?? undefined}
    />
  );
}
