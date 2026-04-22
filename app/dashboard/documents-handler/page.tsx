import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import {
  canAccessDocumensoAsAdmin,
  canAccessDocumensoAsHandler,
} from "@/lib/admin-auth";
import {
  computeDocumensoStats,
  getDocumensoBaseUrl,
  listDocuments,
} from "@/lib/documenso";
import { DocumentsHandlerClient } from "./DocumentsHandlerClient";

export const metadata = {
  title: "Obsługa dokumentów — MyPerformance",
};
export const dynamic = "force-dynamic";

export default async function DocumentsHandlerPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  if (
    !canAccessDocumensoAsHandler(session) &&
    !canAccessDocumensoAsAdmin(session)
  ) {
    redirect("/forbidden");
  }

  const [docs, baseUrl] = await Promise.all([
    listDocuments(),
    Promise.resolve(getDocumensoBaseUrl() ?? "https://sign.myperformance.pl"),
  ]);
  const stats = computeDocumensoStats(docs);

  return (
    <DocumentsHandlerClient
      documents={docs}
      stats={stats}
      documensoBaseUrl={baseUrl}
      userLabel={session.user.name ?? session.user.email ?? undefined}
      userEmail={session.user.email ?? undefined}
    />
  );
}
