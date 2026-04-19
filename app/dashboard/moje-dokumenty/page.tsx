import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { redirect } from "next/navigation";
import { listSubmissionsForEmail } from "@/lib/docuseal";
import { MojeDokumentyClient } from "./MojeDokumentyClient";

export const metadata = { title: "Moje dokumenty — MyPerformance" };
export const dynamic = "force-dynamic";

export default async function MojeDokumentyPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const documents = await listSubmissionsForEmail(session.user.email);

  return (
    <main className="max-w-5xl mx-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Moje dokumenty</h1>
        <p className="text-sm text-slate-400 mt-1">
          Twoje dokumenty do podpisania oraz już podpisane. Dane pochodzą z systemu Docuseal
          (<code className="text-brand-400">sign.myperformance.pl</code>).
        </p>
      </header>

      <MojeDokumentyClient documents={documents} userEmail={session.user.email} />
    </main>
  );
}
