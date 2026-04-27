import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canManageCertificates, canAccessKeycloakAdmin } from "@/lib/admin-auth";
import { listLocations } from "@/lib/locations";
import { LocationsClient } from "./LocationsClient";

export const metadata = { title: "Punkty — Admin" };
export const dynamic = "force-dynamic";

export default async function LocationsAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  // Punkty są danymi biznesowymi powiązanymi z certyfikatami (assignment).
  // Edycja wymaga roli certificates_admin (managemy cert ↔ punkt) albo
  // keycloak_admin (super-admin). Każdy z tych dostatecznie uzasadnia dostęp.
  if (!canManageCertificates(session) && !canAccessKeycloakAdmin(session)) {
    redirect("/forbidden");
  }

  const initial = await listLocations({ enabledOnly: false });

  return (
    <LocationsClient
      initial={initial}
      userLabel={session.user?.name ?? session.user?.email ?? undefined}
      userEmail={session.user?.email ?? undefined}
    />
  );
}
