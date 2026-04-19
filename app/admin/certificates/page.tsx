import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { redirect } from "next/navigation";
import { listCertificates } from "@/lib/step-ca";
import { CertificatesClient } from "./CertificatesClient";

export const metadata = { title: "Certyfikaty klienckie — Admin" };

export default async function CertificatesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.includes("admin")) redirect("/dashboard");

  const certs = await listCertificates();

  return (
    <main className="max-w-6xl mx-auto p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-100">Certyfikaty klienckie</h1>
        <p className="text-sm text-slate-400 mt-1">
          Wystawianie i zarządzanie certyfikatami mTLS dla paneli sprzedawcy, serwisanta,
          kierowcy oraz Obiegu dokumentów.
        </p>
      </header>

      <CertificatesClient initialCerts={certs} />
    </main>
  );
}
