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
    <main className="max-w-6xl mx-auto p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Certyfikaty klienckie</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Wystawianie i zarządzanie certyfikatami mTLS dla paneli sprzedawcy, serwisanta
          oraz kierowcy.
        </p>
      </header>

      <CertificatesClient initialCerts={certs} />
    </main>
  );
}
