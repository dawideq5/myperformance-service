import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const hasRole = roles.includes("kierowca") || roles.includes("admin");
  if (!hasRole) redirect("/forbidden");

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <section className="max-w-2xl w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-10 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-xl">
            MP
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Panel Kierowcy</h1>
            <p className="text-sm text-slate-400">panelkierowcy.myperformance.pl</p>
          </div>
        </div>
        <p className="text-slate-300 leading-relaxed">
          Witaj, <strong>{session.user?.email ?? session.user?.name}</strong>.
          Ten panel jest obecnie szkieletem. Funkcjonalność zostanie uzupełniona w kolejnych fazach.
        </p>
        <p className="mt-6 text-xs text-slate-500">
          Twoje role: {roles.length ? roles.join(", ") : "brak"}
        </p>
      </section>
    </main>
  );
}
