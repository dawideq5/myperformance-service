import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { redirect } from "next/navigation";
import { canManageCertificates } from "@/lib/admin-auth";
import { listCertificates } from "@/lib/step-ca";
import { CertificatesClient } from "./CertificatesClient";

export const metadata = { title: "Certyfikaty klienckie — Admin" };
export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canManageCertificates(session)) redirect("/forbidden");

  const certs = await listCertificates();

  return (
    <CertificatesClient
      initialCerts={certs}
      userLabel={session.user?.name ?? session.user?.email ?? undefined}
      userEmail={session.user?.email ?? undefined}
    />
  );
}
