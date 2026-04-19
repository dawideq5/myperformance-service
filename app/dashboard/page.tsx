import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

function splitName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  if (!name) return { firstName: "", lastName: "" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }

  const { firstName, lastName } = splitName(session.user.name);
  const email = session.user.email ?? undefined;

  return (
    <DashboardClient
      firstName={firstName || email || "Użytkowniku"}
      lastName={lastName}
      email={email}
    />
  );
}
