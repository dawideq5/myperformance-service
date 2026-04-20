import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  computeStats,
  getBaseUrl,
  isConfigured,
  listSubmissions,
  listTemplates,
} from "@/lib/docuseal";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui";
import { ObiegClient } from "./ObiegClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const hasRole = roles.includes("dokumenty_access") || isAdmin;
  if (!hasRole) redirect("/forbidden");

  const configured = isConfigured();
  const [templates, submissions] = configured
    ? await Promise.all([listTemplates(), listSubmissions()])
    : [[], []];
  const stats = computeStats(submissions);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <AppHeader
        userLabel={
          [
            (session.user as { given_name?: string; firstName?: string } | undefined)?.given_name,
            (session.user as { family_name?: string; lastName?: string } | undefined)?.family_name,
          ]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          (session.user?.name ?? session.user?.email ?? "")
        }
        userSubLabel={session.user?.email ?? undefined}
        roles={roles}
      />

      <section className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Obieg dokumentów</h1>
        <p className="text-sm text-slate-400 mt-1">
          Wysyłka, śledzenie i archiwizacja podpisów elektronicznych. Silnik:{" "}
          <code className="text-brand-400">sign.myperformance.pl</code>.
        </p>
      </section>

      {!configured ? (
        <div className="mb-5">
          <Alert tone="warning">
            Docuseal jeszcze niepodłączony. Ustaw <code>DOCUSEAL_URL</code> oraz{" "}
            <code>DOCUSEAL_API_KEY</code> w Coolify dla tej aplikacji, aby móc
            przesyłać szablony.
          </Alert>
        </div>
      ) : null}

      <ObiegClient
        initialTemplates={templates}
        initialSubmissions={submissions}
        initialStats={stats}
        configured={configured}
        docusealUrl={getBaseUrl()}
        isAdmin={isAdmin}
      />
    </main>
  );
}
