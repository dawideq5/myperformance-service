import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import {
  canAccessKeycloakAdmin,
  canManageCertificates,
} from "@/lib/admin-auth";
import {
  getConfigOverviewStats,
  listCertLinks,
} from "@/lib/config-overview";
import { listLocations } from "@/lib/locations";
import { ConfigClient } from "./ConfigClient";

export const metadata = { title: "Zarządzanie konfiguracją — Admin" };
export const dynamic = "force-dynamic";

export default async function ConfigHubPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canManageCertificates(session) && !canAccessKeycloakAdmin(session)) {
    redirect("/forbidden");
  }

  const [stats, links, locations] = await Promise.all([
    getConfigOverviewStats(),
    listCertLinks(),
    listLocations({ enabledOnly: false }),
  ]);

  return (
    <ConfigClient
      stats={stats}
      links={links}
      locations={locations}
      userLabel={session.user?.name ?? session.user?.email ?? undefined}
      userEmail={session.user?.email ?? undefined}
    />
  );
}
