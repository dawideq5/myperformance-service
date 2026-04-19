"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginInner() {
  const params = useSearchParams();
  const error = params.get("error");
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <section className="max-w-md w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-10 shadow-xl text-center">
        <div className="w-14 h-14 rounded-xl bg-brand-600 mx-auto flex items-center justify-center text-white font-bold text-2xl mb-6">
          MP
        </div>
        <h1 className="text-xl font-semibold text-slate-100 mb-2">Panel Sprzedawcy</h1>
        <p className="text-sm text-slate-400 mb-6">
          Aby kontynuować, zaloguj się przez MyPerformance SSO.
        </p>
        {error ? (
          <p className="mb-4 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
            Logowanie nieudane. Spróbuj ponownie.
          </p>
        ) : null}
        <button
          onClick={() => signIn("keycloak", { callbackUrl: "/" })}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg transition"
        >
          Zaloguj przez Keycloak
        </button>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
