import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { redirect } from "next/navigation";
import { computeDocumentStats, listSubmissionsForEmail } from "@/lib/docuseal";
import { MojeDokumentyClient } from "./MojeDokumentyClient";

export const metadata = { title: "Moje dokumenty — MyPerformance" };
export const dynamic = "force-dynamic";

export default async function MojeDokumentyPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const documents = await listSubmissionsForEmail(session.user.email);
  const stats = computeDocumentStats(documents);

  return (
    <main className="max-w-5xl mx-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Moje dokumenty</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Twoje dokumenty do podpisania oraz już podpisane. Dane pochodzą z systemu Docuseal
          (<code className="text-[var(--accent)]">sign.myperformance.pl</code>).
        </p>
      </header>

      <MojeDokumentyClient
        initialDocuments={documents}
        initialStats={stats}
        userEmail={session.user.email}
      />
    </main>
  );
}
