import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isConfigured, listSubmissions, listTemplates } from "@/lib/docuseal";
import { ObiegClient } from "./ObiegClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const hasRole = roles.includes("dokumenty_access") || roles.includes("admin");
  if (!hasRole) redirect("/forbidden");

  const configured = isConfigured();
  const [templates, submissions] = configured
    ? await Promise.all([listTemplates(), listSubmissions()])
    : [[], []];

  return (
    <main className="max-w-6xl mx-auto p-8">
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Obieg dokumentów</h1>
          <p className="text-sm text-slate-400 mt-1">
            dokumenty.myperformance.pl — wysyłka dokumentów do podpisu przez <code className="text-brand-400">sign.myperformance.pl</code>.
          </p>
        </div>
        <div className="text-xs text-slate-500 text-right">
          <div>{session.user?.email}</div>
          <div className="mt-1">Role: {roles.join(", ")}</div>
        </div>
      </header>

      {!configured ? (
        <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-6 mb-6">
          <p className="text-sm text-amber-200">
            Docuseal jeszcze niepodłączony. Ustaw <code>DOCUSEAL_URL</code> oraz <code>DOCUSEAL_API_KEY</code> w Coolify dla tej aplikacji, aby móc przesyłać szablony.
          </p>
        </div>
      ) : null}

      <ObiegClient
        templates={templates}
        submissions={submissions}
        configured={configured}
        docusealUrl={process.env.DOCUSEAL_URL?.replace(/\/$/, "") ?? null}
      />
    </main>
  );
}
